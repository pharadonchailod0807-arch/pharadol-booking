// Read-only deployment backup. Credentials stay in environment variables, not argv/logs.
import nextEnv from "@next/env";
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, chmod, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const run = promisify(execFile),
  expectedRef = "kwkxxyhwnkkchkqwiavw";
const connection = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
let client, backupPath;
try {
  if (!connection)
    throw Object.assign(new Error("Set SUPABASE_DB_URL in .env.local first"), {
      code: "MISSING_DATABASE_URL",
    });
  const url = new URL(connection),
    user = decodeURIComponent(url.username),
    password = decodeURIComponent(url.password);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    (!user.endsWith("." + expectedRef) &&
      url.hostname !== "db." + expectedRef + ".supabase.co")
  )
    throw Object.assign(
      new Error("Target does not match the verified project"),
      { code: "WRONG_DATABASE_TARGET" },
    );
  if (!password || password.includes("[YOUR-PASSWORD]"))
    throw Object.assign(
      new Error("Replace the database password placeholder"),
      { code: "MISSING_DATABASE_PASSWORD" },
    );
  const directory = path.join(tmpdir(), "pharadol-equipment-backups");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const binary = [
    "/opt/homebrew/opt/libpq/bin/pg_dump",
    "/usr/bin/pg_dump",
  ].find((p) => existsSync(p));
  if (!binary)
    throw Object.assign(new Error("pg_dump is not installed"), {
      code: "MISSING_PG_DUMP",
    });
  const config = {
    host: url.hostname,
    port: Number(url.port || 5432),
    user,
    password,
    database: url.pathname.slice(1) || "postgres",
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: true },
  };
  client = new pg.Client(config);
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshot = (await client.query("SELECT pg_export_snapshot() snapshot"))
    .rows[0].snapshot;
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
  const counts = {};
  for (const table of tables) {
    const identifier = '"' + table.replaceAll('"', '""') + '"';
    counts[table] = Number(
      (await client.query("SELECT count(*) count FROM public." + identifier))
        .rows[0].count,
    );
  }
  backupPath = path.join(
    directory,
    "before-equipment-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      ".dump",
  );
  const env = {
    ...process.env,
    PGHOST: config.host,
    PGPORT: String(config.port),
    PGUSER: user,
    PGPASSWORD: password,
    PGDATABASE: config.database,
    PGSSLMODE: "require",
    PGCONNECT_TIMEOUT: "15",
    PGAPPNAME: "pharadol-equipment-backup",
  };
  await run(
    binary,
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--lock-wait-timeout=10s",
      "--snapshot=" + snapshot,
      "--file",
      backupPath,
    ],
    { env, maxBuffer: 1024 * 1024 },
  );
  await client.query("COMMIT");
  await chmod(backupPath, 0o600);
  const bytes = await readFile(backupPath);
  const list = await run(path.join(path.dirname(binary), "pg_restore"), [
    "--list",
    backupPath,
  ]);
  const missing = tables.filter(
    (table) => !list.stdout.includes("TABLE public " + table + " "),
  );
  if (!bytes.length || missing.length)
    throw Object.assign(new Error("Archive verification failed"), {
      code: "BACKUP_VERIFICATION_FAILED",
    });
  const manifest = {
    projectRef: expectedRef,
    createdAt: new Date().toISOString(),
    file: backupPath,
    format: "pg_dump custom",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    publicTableCounts: counts,
    archiveReadable: true,
    restoreTested: false,
  };
  await writeFile(
    backupPath + ".manifest.json",
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(manifest, null, 2));
} catch (error) {
  if (backupPath) await rm(backupPath, { force: true });
  console.error(
    JSON.stringify({
      backupCreated: false,
      errorCode: error.code || "BACKUP_FAILED",
      message:
        "Backup not ready. Database contents and credentials were not logged.",
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}

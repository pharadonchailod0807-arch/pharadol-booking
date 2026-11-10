// Restore the read-only portal backup in a private local PostgreSQL instance.
// Never connects to Production. Never logs business records or authentication values.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { randomUUID, createHash } from "node:crypto";
const file = process.argv[2];
if (!file) throw new Error("Pass a private backup JSON path");
const dump = JSON.parse(await fs.readFile(file, "utf8"));
if (dump.format !== "pharadol-public-logical-v1")
  throw new Error("Unexpected backup format");
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "equipment-restore-"));
const port = await new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const port = s.address().port;
    s.close(() => resolve(port));
  });
});
const password = randomUUID();
const server = new EmbeddedPostgres({
  databaseDir: path.join(dir, "db"),
  user: "postgres",
  password,
  port,
  persistent: false,
  onLog() {},
  onError() {},
  postgresFlags: ["-h", "127.0.0.1"],
});
const ident = (s) => '"' + String(s).replaceAll('"', '""') + '"';
const literal = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const canonical = (value) => JSON.stringify(order(value));
function order(value) {
  if (Array.isArray(value)) return value.map(order);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, order(value[k])]),
    );
  return value;
}
const hash = (rows) =>
  createHash("sha256")
    .update(rows.map(canonical).sort().join("\n"))
    .digest("hex");
let client;
try {
  await server.initialise();
  await server.start();
  client = new pg.Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password,
    database: "postgres",
  });
  await client.connect();
  await client.query("SET TIME ZONE 'UTC'; SET check_function_bodies=off");
  const roles = new Set([
    "anon",
    "authenticated",
    "service_role",
    ...dump.policies.flatMap((p) => p.roles),
    ...dump.storage_policies.flatMap((p) => p.roles),
    ...dump.grants.map((g) => g.grantee),
  ]);
  for (const role of roles)
    if (!["public", "postgres", "PUBLIC"].includes(role))
      await client.query(
        "CREATE ROLE " +
          ident(role) +
          (role === "service_role" ? " BYPASSRLS" : ""),
      );
  for (const table of dump.tables) {
    if (table.columns.some((c) => c.identity || c.generated))
      throw new Error(
        "Unexpected identity/generated column; expand restore support before proceeding",
      );
    await client.query(
      "CREATE TABLE public." +
        ident(table.name) +
        " (" +
        table.columns
          .map(
            (c) =>
              ident(c.name) +
              " " +
              c.type +
              (c.default ? " DEFAULT " + c.default : "") +
              (c.not_null ? " NOT NULL" : ""),
          )
          .join(",") +
        ")",
    );
  }
  if (dump.sequences.length)
    throw new Error(
      "Unexpected sequences; expand restore support before proceeding",
    );
  for (const fn of dump.functions) await client.query(fn);
  for (const table of dump.tables) {
    const columns = table.columns.map((c) => ident(c.name)).join(",");
    await client.query(
      "INSERT INTO public." +
        ident(table.name) +
        " (" +
        columns +
        ") SELECT " +
        columns +
        " FROM jsonb_populate_recordset(NULL::public." +
        ident(table.name) +
        ",$1::jsonb)",
      [JSON.stringify(dump.data[table.name])],
    );
  }
  for (const c of dump.constraints)
    await client.query(
      "ALTER TABLE public." +
        ident(c.table) +
        " ADD CONSTRAINT " +
        ident(c.name) +
        " " +
        c.definition,
    );
  for (const index of dump.indexes) await client.query(index);
  for (const trigger of dump.triggers) await client.query(trigger);
  for (const table of dump.tables) {
    if (table.rls)
      await client.query(
        "ALTER TABLE public." +
          ident(table.name) +
          " ENABLE ROW LEVEL SECURITY",
      );
    if (table.force_rls)
      await client.query(
        "ALTER TABLE public." + ident(table.name) + " FORCE ROW LEVEL SECURITY",
      );
  }
  const policySql = (p) =>
    "CREATE POLICY " +
    ident(p.policyname) +
    " ON " +
    ident(p.schemaname) +
    "." +
    ident(p.tablename) +
    " AS " +
    p.permissive +
    " FOR " +
    p.cmd +
    " TO " +
    p.roles.map((r) => (r === "public" ? "PUBLIC" : ident(r))).join(",") +
    (p.qual ? " USING (" + p.qual + ")" : "") +
    (p.with_check ? " WITH CHECK (" + p.with_check + ")" : "");
  for (const policy of dump.policies) await client.query(policySql(policy));
  for (const g of dump.grants)
    await client.query(
      "GRANT " +
        g.privilege_type +
        " ON public." +
        ident(g.table_name) +
        " TO " +
        (g.grantee === "PUBLIC" ? "PUBLIC" : ident(g.grantee)) +
        (g.is_grantable === "YES" ? " WITH GRANT OPTION" : ""),
    );
  const report = [];
  for (const table of dump.tables) {
    const rows = (
      await client.query(
        "SELECT to_jsonb(t) row FROM public." + ident(table.name) + " t",
      )
    ).rows.map((r) => r.row);
    const matching = hash(rows) === hash(dump.data[table.name]);
    report.push({
      table: table.name,
      count: rows.length,
      contentMatches: matching,
    });
    if (!matching) throw new Error("Restored content mismatch");
  }
  await client.query(`CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[1:greatest(array_length(string_to_array(name,'/'),1)-1,0)] $$;`);
  for (const bucket of dump.storage_buckets)
    await client.query(
      "INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES($1,$2,$3,$4,$5)",
      [
        bucket.id,
        bucket.name,
        bucket.public,
        bucket.file_size_limit,
        bucket.allowed_mime_types,
      ],
    );
  for (const p of dump.storage_policies) await client.query(policySql(p));
  await client.query(
    await fs.readFile(
      new URL(
        "../supabase/migrations/202611090001_equipment.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const table of dump.tables) {
    const rows = (
      await client.query(
        "SELECT to_jsonb(t) row FROM public." + ident(table.name) + " t",
      )
    ).rows.map((r) => r.row);
    if (hash(rows) !== hash(dump.data[table.name]))
      throw new Error("Legacy content changed during migration test");
  }
  const equipmentCount = Number(
    (await client.query("SELECT count(*) n FROM equipment")).rows[0].n,
  );
  const categoryCount = Number(
    (await client.query("SELECT count(*) n FROM equipment_categories")).rows[0]
      .n,
  );
  if (equipmentCount !== 0 || categoryCount !== 11)
    throw new Error("Unexpected seed data");
  const result = {
    restored: true,
    legacyTables: report,
    migrationAppliedToIsolatedRestore: true,
    legacyContentUnchangedAfterMigration: true,
    equipmentCount,
    categoryCount,
    verifiedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    file + ".restore-verification.json",
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      restored: false,
      errorCode: error.code || "RESTORE_FAILED",
      errorType: error.constructor.name,
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  await server.stop().catch(() => {});
  await fs.rm(dir, { recursive: true, force: true });
}

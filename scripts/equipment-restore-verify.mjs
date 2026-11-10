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
let phase = "init";
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
  phase = "sequences";
  // Identity sequences are created with their owning columns; other sequences must precede defaults.
  const identitySequences = new Set(
    dump.tables.flatMap((t) =>
      t.columns.filter((c) => c.identity).map((c) => `${t.name}_${c.name}_seq`),
    ),
  );
  for (const seq of dump.sequences) {
    if (!identitySequences.has(seq.sequencename))
      await client.query(
        `CREATE SEQUENCE public.${ident(seq.sequencename)} AS ${seq.data_type} START WITH ${BigInt(seq.start_value)} INCREMENT BY ${BigInt(seq.increment_by)} MINVALUE ${BigInt(seq.min_value)} MAXVALUE ${BigInt(seq.max_value)} CACHE ${BigInt(seq.cache_size)} ${seq.cycle ? "CYCLE" : "NO CYCLE"}`,
      );
  }
  phase = "tables";
  for (const table of dump.tables) {
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
              (c.generated
                ? ` GENERATED ALWAYS AS (${c.default}) STORED`
                : c.identity
                  ? ` GENERATED ${c.identity === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`
                  : c.default
                    ? " DEFAULT " + c.default
                    : "") +
              (c.not_null ? " NOT NULL" : ""),
          )
          .join(",") +
        ")",
    );
  }
  // Restore the Equipment view defined by the original, verified additive migration.
  if (dump.tables.some((t) => t.name === "equipment")) {
    await client.query(
      "CREATE VIEW public.equipment_inventory WITH (security_invoker=true) AS SELECT e.*,c.name AS category_name FROM public.equipment e JOIN public.equipment_categories c ON c.id=e.category_id AND c.brand=e.brand",
    );
  }
  phase = "functions";
  for (const fn of dump.functions) await client.query(fn);
  phase = "data";
  for (const table of dump.tables) {
    const columns = table.columns
      .filter((c) => !c.generated)
      .map((c) => ident(c.name))
      .join(",");
    await client.query(
      "INSERT INTO public." +
        ident(table.name) +
        " (" +
        columns +
        ") OVERRIDING SYSTEM VALUE SELECT " +
        columns +
        " FROM jsonb_populate_recordset(NULL::public." +
        ident(table.name) +
        ",$1::jsonb)",
      [JSON.stringify(dump.data[table.name])],
    );
  }
  for (const seq of dump.sequences) {
    if (seq.last_value !== null)
      await client.query("SELECT setval($1,$2,true)", [
        "public." + seq.sequencename,
        seq.last_value,
      ]);
  }
  phase = "constraints";
  for (const c of dump.constraints
    .filter((c) => !c.definition.startsWith("TRIGGER"))
    .sort(
      (a, b) =>
        Number(a.definition.startsWith("FOREIGN KEY")) -
        Number(b.definition.startsWith("FOREIGN KEY")),
    ))
    await client.query(
      "ALTER TABLE public." +
        ident(c.table) +
        " ADD CONSTRAINT " +
        ident(c.name) +
        " " +
        c.definition,
    );
  phase = "indexes";
  for (const index of dump.indexes) await client.query(index);
  phase = "triggers";
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
  phase = "policies";
  for (const policy of dump.policies) await client.query(policySql(policy));
  phase = "grants";
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
  phase = "verify";
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
  phase = "storage";
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
  phase = "migration";
  const migration =
    process.argv[3] ||
    (dump.tables.some((t) => t.name === "equipment")
      ? "202611100001_equipment_images.sql"
      : "202611090001_equipment.sql");
  if (!/^\d{12}_[a-z_]+\.sql$/.test(migration))
    throw new Error("Unexpected migration filename");
  await client.query(
    await fs.readFile(
      new URL("../supabase/migrations/" + migration, import.meta.url),
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
      phase,
      errorCode: error.code || "RESTORE_FAILED",
      ...(error.code === "42601"
        ? { syntax: error.message, position: error.position }
        : {}),
      errorType: error.constructor.name,
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  await server.stop().catch(() => {});
  await fs.rm(dir, { recursive: true, force: true });
}

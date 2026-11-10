import EmbeddedPostgres from "embedded-postgres";
import { Pool, types } from "pg";
types.setTypeParser(1082, (value) => value);
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
export async function startEquipmentTestDatabase({ images = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "pharadol-equipment-test-"));
  const port = await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const password = randomUUID();
  const pg = new EmbeddedPostgres({
    databaseDir: join(dir, "db"),
    user: "postgres",
    password,
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
    postgresFlags: ["-h", "127.0.0.1"],
  });
  let pool;
  let closing = false;
  try {
    await pg.initialise();
    await pg.start();
    pool = new Pool({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password,
      database: "postgres",
      max: 24,
    });
    pool.on("error", (error) => {
      if (!closing || error.code !== "57P01") throw error;
    });
    await pool.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
   CREATE SCHEMA storage;
   CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text);
   ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
   GRANT USAGE ON SCHEMA storage TO anon,authenticated;
   GRANT SELECT,INSERT ON storage.objects TO anon,authenticated;
   CREATE POLICY legacy_allow_fixture ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
   INSERT INTO storage.objects(bucket_id) VALUES('equipment-private'),('existing-business-bucket');
   CREATE TABLE public.legacy_booking_fixture(id int PRIMARY KEY,note text);
   INSERT INTO public.legacy_booking_fixture VALUES(1,'must remain unchanged');`);
    await pool.query(
      await readFile(
        new URL(
          "../supabase/migrations/202611090001_equipment.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    if (images)
      await pool.query(
        await readFile(
          new URL(
            "../supabase/migrations/202611100001_equipment_images.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
    return {
      pool,
      port,
      async close() {
        closing = true;
        await pool.end();
        await pg.stop();
        await rm(dir, { recursive: true, force: true });
      },
    };
  } catch (e) {
    await pool?.end();
    await pg.stop().catch(() => {});
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
}

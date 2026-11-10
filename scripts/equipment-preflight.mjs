// Read-only readiness check. Never applies migrations or creates test records.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SECRET",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(JSON.stringify({ ready: false, missing }, null, 2));
  process.exitCode = 1;
} else if (process.env.AUTH_SECRET.length < 32) {
  console.error(
    "AUTH_SECRET must be at least 32 characters; value was not displayed.",
  );
  process.exitCode = 1;
} else {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const checks = await Promise.allSettled([
    db.rpc("equipment_summary"),
    db.rpc("equipment_return_history", {
      p_equipment_id: "00000000-0000-0000-0000-000000000000",
      p_offset: 0,
    }),
    db
      .from("equipment_categories")
      .select("id", { count: "exact", head: true })
      .eq("brand", "pharadol"),
    db.storage.getBucket("equipment-private"),
  ]);
  const labels = [
    "summary RPC",
    "return history RPC",
    "categories table",
    "private Storage bucket",
  ];
  const report = checks.map((r, i) => ({
    check: labels[i],
    ok:
      r.status === "fulfilled" &&
      !r.value.error &&
      (i !== 3 || r.value.data?.public === false),
  }));
  console.log(
    JSON.stringify(
      { ready: report.every((r) => r.ok), checks: report },
      null,
      2,
    ),
  );
  if (report.some((r) => !r.ok)) process.exitCode = 1;
}

import http from "node:http";
import { readFile } from "node:fs/promises";

export async function migratePurchase(pool, { legacy = false } = {}) {
  for (const migration of ["202611240001_purchase.sql", "202611240002_purchase_equipment.sql"]) {
    await pool.query(await readFile(new URL("../../supabase/migrations/" + migration, import.meta.url), "utf8"));
  }
  if (!legacy) await migrateApprovalSettings(pool);
}

export async function migrateApprovalSettings(pool) {
  await pool.query(await readFile(new URL("../../supabase/migrations/202611260001_purchase_approval_settings.sql", import.meta.url), "utf8"));
}

const tables = new Set([
  "purchase_requisitions", "purchase_approvers", "purchase_approval_steps", "purchase_approval_rounds",
  "purchase_approval_sessions", "purchase_attachments", "purchase_payments", "purchase_email_outbox",
  "purchase_audit_logs", "user_sessions", "admin_users",
]);
const functions = new Set([
  "purchase_list", "purchase_save", "purchase_mutate", "purchase_approver_save", "purchase_snapshot",
  "purchase_otp", "purchase_review", "purchase_email_claim", "purchase_email_finish",
  "purchase_email_block", "purchase_equipment_options", "purchase_into_equipment",
]);
function identifier(value) {
  if (!/^[a-z_]+$/.test(value)) throw new Error("Invalid fixture SQL identifier");
  return '"' + value + '"';
}

async function requestBytes(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Only the query forms exercised by purchase routes are implemented by this test double.
async function records(connection, table, params) {
  const values = [];
  const columns = [];
  const joins = [];
  const where = [];
  const select = params.get("select") || "*";
  const embed = /([a-z]+):([a-z_]+)!inner\(([a-z_,]+)\)/g;
  for (const [, alias, relation, fields] of select.matchAll(embed)) {
    if (!tables.has(relation)) throw new Error("Unknown test relationship");
    const target = identifier(alias);
    const key = relation === "purchase_requisitions" ? "requisition_id" : "step_id";
    joins.push(`JOIN ${identifier(relation)} ${target} ON ${target}.id=t.${identifier(key)}`);
    const pairs = fields.split(",").map((field) => `'${field}', ${target}.${identifier(field)}`).join(",");
    columns.push(`jsonb_build_object(${pairs}) AS ${target}`);
  }
  for (const field of select.replace(embed, "").split(",").filter(Boolean)) {
    if (field === "*") { columns.push("t.*"); continue; }
    const [name, cast] = field.split("::");
    if (cast && cast !== "text") throw new Error("Unsupported fixture cast");
    columns.push(`t.${identifier(name)}${cast ? "::text" : ""} AS ${identifier(name)}`);
  }
  for (const [column, filter] of params) {
    if (["select", "limit", "order"].includes(column)) continue;
    const field = "t." + identifier(column);
    const [operator, ...tail] = filter.split(".");
    const value = tail.join(".");
    if (operator === "in") {
      values.push(value.slice(1,-1).split(","));
      where.push(`${field}=ANY($${values.length}::text[])`);
    } else {
      const compare = { eq: "=", gt: ">", lte: "<=" }[operator];
      if (!compare) throw new Error("Unsupported fixture filter");
      values.push(value);
      where.push(`${field}${compare}$${values.length}`);
    }
  }
  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
  const order = params.get("order");
  const orderClause = order ? "ORDER BY " + order.split(",").map((entry) => {
    const [field, direction] = entry.split(".");
    return "t." + identifier(field) + (direction === "desc" ? " DESC" : " ASC");
  }).join(",") : "";
  const limit = Math.min(1000, Number(params.get("limit")) || 1000);
  return (await connection.query(
    `SELECT ${columns.join(",")} FROM ${identifier(table)} t ${joins.join(" ")} ${whereClause} ${orderClause} LIMIT ${limit}`,
    values,
  )).rows;
}

export async function startPurchaseStub(pool) {
  const mail = new Map();
  const files = new Map();
  let failure = false;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const json = (payload, status = 200) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
    };
    if (request.headers.authorization !== "Bearer local-purchase-only") return json({ error: "unauthorized" }, 401);
    try {
      if (url.pathname === "/fixture/resend") {
        if (failure) { failure = false; return json({ name: "internal_server_error" }, 503); }
        const key = request.headers["idempotency-key"];
        const body = JSON.parse(await requestBytes(request));
        const existing = mail.get(key);
        if (existing && JSON.stringify(existing.body) !== JSON.stringify(body)) return json({ name: "idempotency_conflict" }, 409);
        if (!existing) mail.set(key, { body, id: "mail-" + (mail.size + 1) });
        return json({ id: mail.get(key).id });
      }
      if (url.pathname.startsWith("/storage/v1/object")) {
        const key = url.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?/, "");
        if (request.method === "POST") {
          if (files.has(key)) return json({ error: "duplicate fixture file" }, 409);
          files.set(key, [await requestBytes(request), request.headers["content-type"]]);
          return json({ Key: key });
        }
        if (request.method === "DELETE") {
          const { prefixes } = JSON.parse(await requestBytes(request));
          for (const prefix of prefixes) files.delete(key + "/" + prefix);
          return json([]);
        }
        const found = files.get(key);
        if (!found) return json({ error: "fixture file not found" }, 404);
        response.writeHead(200, { "Content-Type": found[1] });
        return response.end(found[0]);
      }
      const target = url.pathname.split("/").pop();
      if (!tables.has(target) && !functions.has(target)) return json([]);
      if (target === "user_sessions") return json({ code: "PGRST205", message: "Fixture uses signed sessions" }, 404);
      const connection = await pool.connect();
      try {
        await connection.query("SET ROLE service_role");
        if (functions.has(target)) {
          const data = JSON.parse(await requestBytes(request));
          const entries = Object.entries(data).filter(([, value]) => value !== undefined);
          const named = entries.map(([name], index) => identifier(name) + " => $" + (index + 1)).join(",");
          const values = entries.map(([, value]) => Array.isArray(value) ? JSON.stringify(value) : value);
          const output = await connection.query(`SELECT ${identifier(target)}(${named}) AS value`, values);
          return json(output.rows[0].value);
        }
        const rows = await records(connection, target, url.searchParams);
        return json(request.headers.accept === "application/vnd.pgrst.object+json" ? rows[0] ?? null : rows);
      } finally {
        await connection.query("RESET ROLE");
        connection.release();
      }
    } catch (error) {
      return json({ code: error.code || "fixture", message: error.message }, 400);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    mail,
    failNextEmail() { failure = true; },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Test-only Supabase HTTP adapter backed by a temporary PostgreSQL cluster.
// It is never imported by application code and never reads .env files.
import http from "node:http";
import { randomUUID } from "node:crypto";
const tables = new Set([
  "equipment_inventory",
  "equipment_categories",
  "equipment",
  "equipment_checkouts",
  "equipment_checkout_items",
  "equipment_returns",
  "equipment_maintenance",
  "equipment_documents",
  "equipment_activity_logs",
  "equipment_images",
  "equipment_image_uploads",
]);
const ident = (s) => {
  if (!/^[a-z_]+$/.test(s)) throw new Error("Invalid test identifier");
  return '"' + s + '"';
};
export async function startEquipmentTestApi(pool) {
  const objects = new Map(),
    tokens = new Map();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "apikey,content-type,x-upsert",
    );
    res.setHeader("Access-Control-Allow-Methods", "PUT,POST,GET,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    const json = (data, status = 200, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(data));
    };
    const body = async () => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      return Buffer.concat(chunks);
    };
    try {
      if (url.pathname.startsWith("/storage/v1/object/")) {
        const service =
          req.headers.authorization === "Bearer equipment-test-service";
        const prefix = "/storage/v1/object/";
        const suffix = url.pathname.slice(prefix.length);
        if (suffix.startsWith("upload/sign/")) {
          const key = suffix.slice("upload/sign/".length);
          if (req.method === "POST" && service) {
            const token = randomUUID();
            tokens.set(token, key);
            return json({ url: `/object/upload/sign/${key}?token=${token}` });
          }
          if (
            req.method === "PUT" &&
            tokens.get(url.searchParams.get("token")) === key
          ) {
            if (objects.has(key)) return json({ error: "Duplicate" }, 409);
            const bytes = await body();
            if (bytes.length > 10485760)
              return json({ error: "Too large" }, 413);
            objects.set(key, { bytes, mime: req.headers["content-type"] });
            return json({ Key: key });
          }
          return json({ error: "unauthorized" }, 401);
        }
        if (suffix.startsWith("sign/")) {
          const key = suffix.slice(5);
          if (req.method === "POST" && service) {
            if (!objects.has(key)) return json({ error: "not found" }, 404);
            const token = randomUUID();
            tokens.set(token, key);
            return json({ signedURL: `/object/sign/${key}?token=${token}` });
          }
          if (tokens.get(url.searchParams.get("token")) !== key)
            return json({ error: "unauthorized" }, 401);
          const obj = objects.get(key);
          if (!obj) return json({ error: "not found" }, 404);
          res.writeHead(200, { "content-type": obj.mime });
          return res.end(obj.bytes);
        }
        if (!service) return json({ error: "unauthorized" }, 401);
        if (req.method === "DELETE") {
          const payload = JSON.parse((await body()).toString());
          for (const path of payload.prefixes || [])
            objects.delete(`${suffix}/${path}`);
          return json([]);
        }
        const key = suffix;
        if (req.method === "POST") {
          if (objects.has(key)) return json({ error: "Duplicate" }, 409);
          objects.set(key, {
            bytes: await body(),
            mime: req.headers["content-type"],
          });
          return json({ Key: key });
        }
        const obj = objects.get(key);
        if (!obj) return json({ error: "not found" }, 404);
        res.writeHead(200, { "content-type": obj.mime });
        return res.end(obj.bytes);
      }
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        if (req.headers.authorization !== "Bearer equipment-test-service")
          return json({ code: "42501" }, 403);
        const name = url.pathname.split("/").pop(),
          p = JSON.parse((await body()).toString());
        const client = await pool.connect();
        try {
          await client.query("SET ROLE service_role");
          let r;
          if (["equipment_mutate", "equipment_save_images"].includes(name))
            r = await client.query(`SELECT ${name}($1,$2,$3,$4,$5) result`, [
              p.p_action,
              p.p_payload,
              p.p_actor,
              p.p_request_id,
              p.p_admin,
            ]);
          else if (name === "equipment_image_cancel")
            r = await client.query(
              "SELECT equipment_image_cancel($1,$2) result",
              [p.p_id, p.p_actor],
            );
          else if (name === "equipment_summary")
            r = await client.query("SELECT equipment_summary() result");
          else if (name === "equipment_maintenance_total")
            r = await client.query(
              "SELECT equipment_maintenance_total($1) result",
              [p.p_equipment_id],
            );
          else if (name === "equipment_return_history")
            r = await client.query(
              "SELECT equipment_return_history($1,$2) result",
              [p.p_equipment_id, p.p_offset],
            );
          else return json({ error: "Unknown RPC" }, 400);
          return json(r.rows[0].result);
        } finally {
          await client.query("RESET ROLE");
          client.release();
        }
      }
      const table = url.pathname.replace("/rest/v1/", "");
      if (!tables.has(table)) return json([]);
      if (req.headers.authorization !== "Bearer equipment-test-service")
        return json({ code: "42501" }, 403);
      const sp = url.searchParams,
        select = sp.get("select") || "*",
        args = [],
        clauses = [];
      const bind = (v) => {
        args.push(v);
        return "$" + args.length;
      };
      for (const [column, filter] of sp) {
        if (["select", "order", "offset", "limit", "or"].includes(column))
          continue;
        if (column === "items.equipment_id") {
          clauses.push(
            `EXISTS(SELECT 1 FROM equipment_checkout_items ci WHERE ci.checkout_id=t.id AND ci.equipment_id=${bind(filter.slice(3))})`,
          );
          continue;
        }
        const col = "t." + ident(column);
        if (filter === "is.null") clauses.push(col + " IS NULL");
        else if (filter === "not.is.null") clauses.push(col + " IS NOT NULL");
        else if (filter.startsWith("eq."))
          clauses.push(col + "=" + bind(filter.slice(3)));
        else if (filter.startsWith("lt."))
          clauses.push(col + "<" + bind(filter.slice(3)));
        else if (filter.startsWith("gt."))
          clauses.push(col + ">" + bind(filter.slice(3)));
        else if (filter.startsWith("in.("))
          clauses.push(
            col +
              "=ANY(" +
              bind(filter.slice(4, -1).split(",")) +
              (column === "id" || column.endsWith("_id")
                ? "::uuid[])"
                : "::text[])"),
          );
        else throw new Error("Unsupported test filter " + filter);
      }
      if (["POST", "PATCH", "DELETE"].includes(req.method)) {
        const row =
          req.method === "DELETE" ? {} : JSON.parse((await body()).toString());
        const fields = Object.keys(row);
        const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
        let sql;
        if (req.method === "POST")
          sql = `INSERT INTO ${ident(table)} (${fields.map(ident).join(",")}) VALUES (${fields.map((f) => bind(row[f])).join(",")}) RETURNING *`;
        if (req.method === "PATCH")
          sql = `UPDATE ${ident(table)} t SET ${fields.map((f) => ident(f) + "=" + bind(row[f])).join(",")} ${where} RETURNING *`;
        if (req.method === "DELETE")
          sql = `DELETE FROM ${ident(table)} t ${where} RETURNING *`;
        const r = await pool.query(sql, args);
        const single = (req.headers.accept || "").includes(
          "application/vnd.pgrst.object+json",
        );
        return json(single ? r.rows[0] || null : r.rows);
      }
      const or = sp.get("or");
      if (or) {
        const searches = or
          .slice(1, -1)
          .split(",")
          .map((f) => {
            const [col, op, ...v] = f.split(".");
            if (op !== "ilike") throw new Error("Unsupported search");
            return "t." + ident(col) + " ILIKE " + bind(v.join("."));
          });
        clauses.push("(" + searches.join(" OR ") + ")");
      }
      const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "",
        order = (sp.get("order") || "")
          .split(",")
          .filter(Boolean)
          .map((o) => {
            const [c, d, n] = o.split(".");
            return (
              "t." +
              ident(c) +
              (d === "desc" ? " DESC" : " ASC") +
              (n === "nullslast" ? " NULLS LAST" : "")
            );
          });
      const count = Number(
        (
          await pool.query(
            "SELECT count(*) n FROM " + ident(table) + " t" + where,
            args,
          )
        ).rows[0].n,
      );
      const offset = Number(sp.get("offset") || 0),
        limit = Math.min(1000, Number(sp.get("limit") || 1000));
      const r = await pool.query(
        "SELECT t.* FROM " +
          ident(table) +
          " t" +
          where +
          (order.length ? " ORDER BY " + order.join(",") : "") +
          " LIMIT " +
          limit +
          " OFFSET " +
          offset,
        args,
      );
      let rows = r.rows;
      if (table === "equipment_checkouts" && select.includes("items:")) {
        for (const c of rows) {
          c.items = (
            await pool.query(
              `SELECT i.*,json_build_object('name',e.name,'equipment_code',e.equipment_code) equipment FROM equipment_checkout_items i JOIN equipment e ON e.id=i.equipment_id WHERE i.checkout_id=$1` +
                (sp.has("items.equipment_id") ? " AND i.equipment_id=$2" : ""),
              sp.has("items.equipment_id")
                ? [c.id, sp.get("items.equipment_id").slice(3)]
                : [c.id],
            )
          ).rows;
        }
      }
      if (table === "equipment_maintenance" && select.includes("equipment:")) {
        for (const m of rows)
          m.equipment = (
            await pool.query(
              "SELECT name,equipment_code FROM equipment WHERE id=$1",
              [m.equipment_id],
            )
          ).rows[0];
      }
      if (select !== "*" && !select.includes("(")) {
        const fields = select.split(",");
        rows = rows.map((row) =>
          Object.fromEntries(fields.map((f) => [f, row[f]])),
        );
      }
      const single = (req.headers.accept || "").includes(
        "application/vnd.pgrst.object+json",
      );
      return json(single ? rows[0] || null : rows, 200, {
        "content-range": `${offset}-${offset + rows.length - 1}/${count}`,
      });
    } catch (e) {
      return json({ message: e.message, code: e.code || "TEST_ERROR" }, 400);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    objects,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

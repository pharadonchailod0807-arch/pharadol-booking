// Test-only Supabase HTTP adapter backed by a temporary PostgreSQL cluster.
// It is never imported by application code and never reads .env files.
import http from "node:http";
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
]);
const ident = (s) => {
  if (!/^[a-z_]+$/.test(s)) throw new Error("Invalid test identifier");
  return '"' + s + '"';
};
export async function startEquipmentTestApi(pool) {
  const objects = new Map();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
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
        if (req.headers.authorization !== "Bearer equipment-test-service")
          return json({ error: "unauthorized" }, 401);
        const key = url.pathname.replace("/storage/v1/object/", "");
        if (req.method === "POST") {
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
          if (name === "equipment_mutate")
            r = await client.query(
              "SELECT equipment_mutate($1,$2,$3,$4,$5) result",
              [p.p_action, p.p_payload, p.p_actor, p.p_request_id, p.p_admin],
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
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

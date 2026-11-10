import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startEquipmentTestDatabase } from "../../scripts/equipment-test-db.mjs";

test("Equipment PostgreSQL migration, stock transactions, real concurrent sessions and RLS", async (t) => {
  const db = await startEquipmentTestDatabase(),
    pool = db.pool;
  try {
    const query = (sql, args = []) => pool.query(sql, args);
    const category = (
      await query(
        "SELECT id FROM equipment_categories WHERE name LIKE 'Camera%'",
      )
    ).rows[0].id;
    const payload = (extra = {}) => ({
      brand: "pharadol",
      name: "อุปกรณ์ทดสอบ",
      category_id: category,
      manufacturer: "Sony",
      model: "FX3",
      serial_number: "",
      description: "test only",
      quantity: 5,
      unit: "ชิ้น",
      storage_location: "คลังทดสอบ",
      purchase_date: "2026-11-09",
      purchase_price: 100,
      supplier: "Test",
      warranty_expiration: "2027-11-09",
      initial_status: "available",
      ...extra,
    });
    async function mutate(
      action,
      p,
      admin = true,
      requestId = randomUUID(),
      actor = "test-user:ผู้ทดสอบ",
    ) {
      const client = await pool.connect();
      try {
        await client.query("SET ROLE service_role");
        const r = await client.query(
          "SELECT equipment_mutate($1,$2::jsonb,$3,$4::uuid,$5) AS result",
          [action, JSON.stringify(p), actor, requestId, admin],
        );
        return r.rows[0].result;
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    }
    const create = (p) => mutate("create", payload(p));
    const equipment = (id) =>
      query("SELECT * FROM equipment WHERE id=$1", [id]).then((r) => r.rows[0]);
    const checkout = (items, extra = {}) =>
      mutate("checkout", {
        borrower: "ทีมทดสอบ",
        checkout_date: "2026-11-09",
        expected_return_date: "2026-11-12",
        related_booking: "TEST-REF",
        notes: "isolated",
        items,
        ...extra,
      });
    const item = (checkout_id) =>
      query("SELECT * FROM equipment_checkout_items WHERE checkout_id=$1", [
        checkout_id,
      ]).then((r) => r.rows[0]);
    const ret = (
      item_id,
      quantity,
      condition = "available",
      key = randomUUID(),
    ) =>
      mutate(
        "return",
        {
          item_id,
          quantity,
          condition,
          return_date: "2026-11-10",
          notes: "test return",
        },
        true,
        key,
      );
    const startMaintenance = (id, extra = {}) =>
      mutate("maintenance_create", {
        equipment_id: id,
        quantity: 1,
        source: "available",
        issue: "ทดสอบซ่อม",
        reported_date: "2026-11-09",
        start_date: "2026-11-09",
        service_provider: "ศูนย์ทดสอบ",
        notes: "",
        ...extra,
      });
    const finishMaintenance = (id, extra = {}) =>
      mutate("maintenance_update", {
        id,
        status: "completed",
        start_date: "2026-11-09",
        completion_date: "2026-11-10",
        service_provider: "ศูนย์ทดสอบ",
        cost: 150,
        notes: "ผ่านการตรวจรับ",
        ...extra,
      });
    await t.test(
      "migration seeds only 11 categories, no equipment, and leaves legacy data intact",
      async () => {
        assert.equal(
          (await query("SELECT count(*)::int n FROM equipment")).rows[0].n,
          0,
        );
        assert.equal(
          (await query("SELECT count(*)::int n FROM equipment_categories"))
            .rows[0].n,
          11,
        );
        assert.equal(
          (await query("SELECT note FROM legacy_booking_fixture")).rows[0].note,
          "must remain unchanged",
        );
      },
    );
    await t.test(
      "create serialised equipment, enforce unit serial uniqueness and database sum constraints",
      async () => {
        const e = await create({ quantity: 1, serial_number: "UNIQUE-SERIAL" });
        assert.match(e.equipment_code, /^EQ-\d{4,}$/);
        assert.equal(e.available, 1);
        await assert.rejects(
          () => create({ quantity: 1, serial_number: "unique-serial" }),
          { code: "23505" },
        );
        await assert.rejects(
          () => create({ quantity: 2, serial_number: "TWO-UNITS" }),
          { code: "23514" },
        );
        await assert.rejects(
          () => query("UPDATE equipment SET available=-1 WHERE id=$1", [e.id]),
          { code: "23514" },
        );
        await assert.rejects(
          () => query("UPDATE equipment SET available=0 WHERE id=$1", [e.id]),
          { code: "23514" },
        );
        await assert.rejects(
          () =>
            query("UPDATE equipment SET available=0,in_use=1 WHERE id=$1", [
              e.id,
            ]),
          { code: "23514" },
        );
      },
    );
    await t.test(
      "20 concurrent inserts allocate unique IDs on separate PostgreSQL connections",
      async () => {
        const rows = await Promise.all(
          Array.from({ length: 20 }, (_, n) =>
            create({ name: `Concurrent ${n}` }),
          ),
        );
        assert.equal(new Set(rows.map((e) => e.equipment_code)).size, 20);
      },
    );
    await t.test(
      "edit uses optimistic version and changes only available quantity for adjustments",
      async () => {
        const e = await create();
        const updated = await mutate("update", {
          ...payload(),
          id: e.id,
          version: e.version,
          name: "ชื่อแก้ไข",
          quantity: 7,
        });
        assert.equal(updated.available, 7);
        await assert.rejects(
          () =>
            mutate("update", { ...payload(), id: e.id, version: e.version }),
          { code: "40001" },
        );
        await assert.rejects(
          () =>
            mutate(
              "update",
              { ...payload(), id: e.id, version: updated.version, quantity: 9 },
              false,
            ),
          { code: "42501" },
        );
      },
    );
    await t.test(
      "multi-item checkout reduces stock and records actor; oversell rolls back entire checkout",
      async () => {
        const a = await create(),
          b = await create();
        const c = await checkout([
          { equipment_id: a.id, quantity: 2 },
          { equipment_id: b.id, quantity: 1 },
        ]);
        assert.equal((await equipment(a.id)).available, 3);
        assert.equal(c.created_by, "test-user:ผู้ทดสอบ");
        const count = (
          await query("SELECT count(*)::int n FROM equipment_checkouts")
        ).rows[0].n;
        await assert.rejects(
          () =>
            checkout([
              { equipment_id: a.id, quantity: 1 },
              { equipment_id: b.id, quantity: 99 },
            ]),
          { code: "23514" },
        );
        assert.equal((await equipment(a.id)).available, 3);
        assert.equal(
          (await query("SELECT count(*)::int n FROM equipment_checkouts"))
            .rows[0].n,
          count,
        );
      },
    );
    await t.test(
      "simultaneous checkout of last unit admits exactly one borrower",
      async () => {
        const e = await create({ quantity: 1 });
        const outcomes = await Promise.allSettled([
          checkout([{ equipment_id: e.id, quantity: 1 }]),
          checkout([{ equipment_id: e.id, quantity: 1 }]),
        ]);
        assert.equal(
          outcomes.filter((r) => r.status === "fulfilled").length,
          1,
        );
        const row = await equipment(e.id);
        assert.equal(row.available, 0);
        assert.equal(row.in_use, 1);
      },
    );
    await t.test(
      "partial return preserves outstanding stock; completed return blocks another return",
      async () => {
        const e = await create(),
          c = await checkout([{ equipment_id: e.id, quantity: 4 }]),
          i = await item(c.id);
        await ret(i.id, 3);
        assert.equal((await equipment(e.id)).in_use, 1);
        assert.equal((await item(c.id)).returned_quantity, 3);
        await ret(i.id, 1);
        assert.equal((await equipment(e.id)).available, 5);
        await assert.rejects(() => ret(i.id, 1), { code: "23514" });
      },
    );
    await t.test(
      "concurrent returns cannot return the same final unit twice",
      async () => {
        const e = await create({ quantity: 1 }),
          c = await checkout([{ equipment_id: e.id, quantity: 1 }]),
          i = await item(c.id);
        const outcomes = await Promise.allSettled([ret(i.id, 1), ret(i.id, 1)]);
        assert.equal(
          outcomes.filter((r) => r.status === "fulfilled").length,
          1,
        );
        assert.equal((await equipment(e.id)).available, 1);
      },
    );
    await t.test(
      "same idempotency key replay, including concurrent retry, changes stock once",
      async () => {
        const e = await create(),
          c = await checkout([{ equipment_id: e.id, quantity: 2 }]),
          i = await item(c.id),
          key = randomUUID();
        const [a, b] = await Promise.all([
          ret(i.id, 1, "available", key),
          ret(i.id, 1, "available", key),
        ]);
        assert.equal(a.id, b.id);
        assert.equal((await item(c.id)).returned_quantity, 1);
        await assert.rejects(() => ret(i.id, 2, "available", key), {
          code: "23514",
        });
      },
    );
    await t.test(
      "damaged and maintenance returns never become available; maintenance return creates repair history",
      async () => {
        const e = await create(),
          c = await checkout([{ equipment_id: e.id, quantity: 3 }]),
          i = await item(c.id);
        await ret(i.id, 1, "damaged");
        await ret(i.id, 1, "maintenance");
        const row = await equipment(e.id);
        assert.equal(row.damaged, 1);
        assert.equal(row.maintenance, 1);
        assert.equal(row.available, 2);
        assert.equal(
          (
            await query(
              "SELECT count(*)::int n FROM equipment_maintenance WHERE equipment_id=$1",
              [e.id],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "maintenance reserves quantity, prevents checkout, requires administrator confirmation and sums expenses",
      async () => {
        const e = await create({ quantity: 1 }),
          m = await startMaintenance(e.id);
        assert.equal((await equipment(e.id)).available, 0);
        await assert.rejects(
          () => checkout([{ equipment_id: e.id, quantity: 1 }]),
          { code: "23514" },
        );
        const p = {
          id: m.id,
          status: "completed",
          start_date: "2026-11-09",
          completion_date: "2026-11-10",
          service_provider: "test",
          cost: 150,
          notes: "",
        };
        await assert.rejects(() => mutate("maintenance_update", p, false), {
          code: "42501",
        });
        await finishMaintenance(m.id);
        const row = await equipment(e.id);
        assert.equal(row.available, 1);
        assert.equal(row.maintenance, 0);
        assert.equal(
          Number(
            (await query("SELECT equipment_maintenance_total($1) n", [e.id]))
              .rows[0].n,
          ),
          150,
        );
        await assert.rejects(() => finishMaintenance(m.id), { code: "23514" });
      },
    );
    await t.test(
      "cancelled repair restores original damaged condition and retains history",
      async () => {
        const e = await create({ initial_status: "damaged" }),
          m = await startMaintenance(e.id, { source: "damaged", quantity: 2 });
        await finishMaintenance(m.id, {
          status: "cancelled",
          completion_date: "",
        });
        assert.equal((await equipment(e.id)).damaged, 5);
        assert.equal((await equipment(e.id)).available, 0);
      },
    );
    await t.test(
      "archive rejects outstanding checkout and repair; restore preserves histories",
      async () => {
        const e = await create(),
          c = await checkout([{ equipment_id: e.id, quantity: 1 }]);
        await assert.rejects(() => mutate("archive", { id: e.id }), {
          code: "23514",
        });
        await ret((await item(c.id)).id, 1);
        const m = await startMaintenance(e.id);
        await assert.rejects(() => mutate("archive", { id: e.id }), {
          code: "23514",
        });
        await finishMaintenance(m.id);
        await mutate("archive", { id: e.id });
        assert.ok((await equipment(e.id)).archived_at);
        await assert.rejects(
          () => checkout([{ equipment_id: e.id, quantity: 1 }]),
          { code: "23514" },
        );
        await mutate("restore", { id: e.id });
        assert.equal((await equipment(e.id)).archived_at, null);
        assert.equal((await item(c.id)).returned_quantity, 1);
      },
    );
    await t.test(
      "category rename/disable preserves equipment and prevents new assignments",
      async () => {
        const c = await mutate("category_save", { name: "หมวดทดสอบ" }),
          e = await create({ category_id: c.id });
        await mutate("category_save", {
          id: c.id,
          name: "เปลี่ยนชื่อแล้ว",
          active: false,
        });
        assert.equal(
          (
            await query(
              "SELECT category_name FROM equipment_inventory WHERE id=$1",
              [e.id],
            )
          ).rows[0].category_name,
          "เปลี่ยนชื่อแล้ว",
        );
        await assert.rejects(() => create({ category_id: c.id }), {
          code: "23514",
        });
        await assert.rejects(
          () => mutate("category_save", { name: "forbidden" }, false),
          { code: "42501" },
        );
      },
    );
    await t.test(
      "cross-brand equipment/category references cannot be submitted",
      async () => {
        const c = (
          await query(
            "INSERT INTO equipment_categories(brand,name) VALUES('adisorn','Future fixture') RETURNING id",
          )
        ).rows[0];
        await assert.rejects(() => create({ category_id: c.id }), {
          code: "23514",
        });
        await assert.rejects(() => create({ brand: "adisorn" }), {
          code: "42501",
        });
        await assert.rejects(
          () => checkout([{ equipment_id: randomUUID(), quantity: 1 }]),
          { code: "23514" },
        );
      },
    );
    await t.test(
      "status adjustment retires/restores stock without changing total quantity",
      async () => {
        const e = await create();
        await mutate("stock_adjust", {
          id: e.id,
          source: "available",
          condition: "retired",
          quantity: 2,
        });
        let row = await equipment(e.id);
        assert.equal(row.retired, 2);
        assert.equal(row.quantity, 5);
        await mutate("stock_adjust", {
          id: e.id,
          source: "retired",
          condition: "available",
          quantity: 1,
        });
        row = await equipment(e.id);
        assert.equal(row.retired, 1);
        assert.equal(row.available, 4);
      },
    );
    await t.test(
      "summary sums quantities, not rows, and counts unit price exactly once",
      async () => {
        const s = (await query("SELECT equipment_summary() s")).rows[0].s,
          aggregate = (
            await query(
              "SELECT sum(quantity)::int q,sum(purchase_price*quantity)::numeric v FROM equipment WHERE brand=$1 AND archived_at IS NULL",
              ["pharadol"],
            )
          ).rows[0];
        assert.equal(s.quantity, aggregate.q);
        assert.equal(Number(s.purchase_value), Number(aggregate.v));
      },
    );
    await t.test(
      "logs and returns cannot be edited; equipment cannot be hard-deleted",
      async () => {
        await assert.rejects(
          () =>
            query(
              "UPDATE equipment_activity_logs SET actor='tampered' WHERE id=(SELECT min(id) FROM equipment_activity_logs)",
            ),
          { code: "23514" },
        );
        const e = await create();
        await assert.rejects(
          () => query("DELETE FROM equipment WHERE id=$1", [e.id]),
          { code: "23514" },
        );
        await assert.rejects(() => query("DELETE FROM equipment_returns"), {
          code: "23514",
        });
        const logs = (
          await query(
            "SELECT action,actor,previous_value,new_value FROM equipment_activity_logs WHERE equipment_id=$1",
            [e.id],
          )
        ).rows;
        assert.ok(
          logs.some(
            (l) =>
              l.action === "create" &&
              l.actor === "test-user:ผู้ทดสอบ" &&
              l.new_value,
          ),
        );
      },
    );
    await t.test(
      "anonymous and Supabase authenticated roles cannot read tables, views or call RPCs",
      async () => {
        for (const role of ["anon", "authenticated"]) {
          const client = await pool.connect();
          try {
            await client.query(`SET ROLE ${role}`);
            for (const sql of [
              "SELECT * FROM equipment",
              "SELECT * FROM equipment_inventory",
              "SELECT * FROM equipment_documents",
              "SELECT equipment_summary()",
              `SELECT equipment_mutate('archive','{}','x','${randomUUID()}',true)`,
            ])
              await assert.rejects(() => client.query(sql), { code: "42501" });
          } finally {
            await client.query("RESET ROLE");
            client.release();
          }
        }
      },
    );
    await t.test(
      "private bucket restriction overrides permissive legacy policies without blocking other buckets",
      async () => {
        const client = await pool.connect();
        try {
          await client.query("SET ROLE anon");
          const rows = (
            await client.query("SELECT bucket_id FROM storage.objects")
          ).rows;
          assert.deepEqual(
            rows.map((r) => r.bucket_id),
            ["existing-business-bucket"],
          );
          await assert.rejects(
            () =>
              client.query(
                "INSERT INTO storage.objects(bucket_id) VALUES('equipment-private')",
              ),
            { code: "42501" },
          );
        } finally {
          await client.query("RESET ROLE");
          client.release();
        }
        assert.equal(
          (
            await query(
              "SELECT public FROM storage.buckets WHERE id='equipment-private'",
            )
          ).rows[0].public,
          false,
        );
      },
    );
  } finally {
    await db.close();
  }
});

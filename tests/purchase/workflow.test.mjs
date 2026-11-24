import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startEquipmentTestDatabase } from "../../scripts/equipment-test-db.mjs";
import { lineMinor, minor, purchaseDate } from "../../lib/purchase/data.js";
import { purchaseAccess } from "../../lib/purchase/access.js";
import { fileInfo, requisitionInput } from "../../lib/purchase/validation.js";
import { documentHtml } from "../../lib/purchase/document.js";

import { migratePurchase } from "./fixtures.mjs";

const actor = "isolated-user";
const date = "2026-11-24";
const makeItem = (name = "กล้องทดสอบ") => ({
  id: randomUUID(), name, quantity: "1.005", unit: "ชิ้น", unit_price: "10.00",
  description: "", vendor: "", url: "", notes: "",
});

function draft(brand, overrides = {}) {
  return { id: randomUUID(), brand, purpose: "ทดสอบแยกสภาพแวดล้อม", reason: "ตรวจสอบขั้นตอน",
    needed_on: "24/11/2569", notes: "", shipping: "10.25", discount: "0.10", vat: "0.70",
    items: [makeItem(), { ...makeItem("ขาตั้ง"), quantity: "2.000", unit_price: "20.00" }], ...overrides };
}

test("Buddhist and Gregorian dates, decimal rounding, file signatures, HTML escaping and brand permissions", () => {
  assert.equal(purchaseDate("2569-11-24"), date);
  assert.equal(purchaseDate("2026-11-24"), date);
  assert.equal(purchaseDate("24/11/2569"), date);
  assert.equal(purchaseDate("29/02/2566"), null);
  assert.equal(purchaseDate("31/04/2026"), null);
  assert.equal(lineMinor("1.005", "0.50"), 50n);
  assert.equal(lineMinor("1.500", "0.01"), 2n);
  assert.equal(minor("10.05"), 1005n);
  assert.throws(() => requisitionInput({ ...draft("pharadol"), discount: "100.00" }, false), /ส่วนลด/);
  assert.equal(fileInfo(Buffer.from("%PDF-1.7"), "application/pdf", "quotation"), "application/pdf");
  assert.throws(() => fileInfo(Buffer.from("%PDF-1.7"), "image/png", "product"), /ประเภท/);
  assert.throws(() => fileInfo(Buffer.alloc(3 * 1024 * 1024 + 1), "image/png", "receipt"), /3 MB/);
  const manager = { active: true, brands: ["pharadol"], role: "MANAGER" };
  assert.equal(purchaseAccess(manager, "pharadol").finance, true);
  assert.equal(purchaseAccess(manager, "adisorn").view, false);
  assert.equal(purchaseAccess({ ...manager, deniedPermissions: ["equipment.view"] }, "pharadol").inventory, false);
  assert.equal(purchaseAccess({ ...manager, deniedPermissions: ["purchase.write"] }, "pharadol").write, false);
  assert.equal(purchaseAccess({ ...manager, role: "VIEWER" }, "pharadol").write, false);
  const html = documentHtml({ document: { brand: "pharadol", number: "PR-20261124-0001", purpose: "<script>alert(1)</script>" },
    files: [], items: [], steps: [] }, { image: () => "" });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});

test("Purchase workflow on isolated PostgreSQL with real concurrent transactions", async (t) => {
  const fixture = await startEquipmentTestDatabase();
  const { pool } = fixture;
  try {
    await migratePurchase(pool);
    const sql = (statement, args) => pool.query(statement, args);
    async function call(name, ...values) {
      const connection = await pool.connect();
      try {
        await connection.query("SET ROLE service_role");
        const parameters = values.map((_, index) => "$" + (index + 1)).join(",");
        return (await connection.query(`SELECT purchase_${name}(${parameters}) AS data`, values)).rows[0].data;
      } finally {
        await connection.query("RESET ROLE");
        connection.release();
      }
    }
    const read = async (id) => (await sql("SELECT * FROM purchase_requisitions WHERE id=$1", [id])).rows[0];
    const save = (data, revision) => call("save", data.brand, data.id, actor, "ผู้เสนอทดสอบ",
      "proposer@example.invalid", requisitionInput({ ...data, version: revision }, Boolean(revision)));
    const mutate = async (data, action, changes = {}) =>
      call("mutate", data.brand, data.id, actor, action, { version: (await read(data.id)).version, ...changes });
    const step = async (data, level) => (await sql(`SELECT id,invite_expires_at::text,status,email FROM purchase_approval_steps
        WHERE requisition_id=$1 AND round=(SELECT round FROM purchase_requisitions WHERE id=$1) AND level=$2`,
    [data.id, level])).rows[0];
    const otp = (s, action, pin, session = null) => call("otp", s.id, s.invite_expires_at, action, pin, session);
    async function makeSession(s) {
      const session = randomUUID();
      assert.equal(await otp(s, "request", "hash"), "sent");
      assert.equal(await otp(s, "verify", "hash", session), "verified");
      return session;
    }
    const approver = (brand, level, email, id) => call("approver_save", brand, actor, {
      id, level, name: "ผู้อนุมัติระดับ " + level, position: level === 1 ? "หัวหน้างาน" : "ผู้บริหาร", email, active: true,
    });
    const doc = draft("pharadol", { items: [{ ...makeItem(), quantity: "1.000" }, { ...makeItem("ขาตั้ง"), quantity: "2.000", unit_price: "20.00" }] });

    await t.test("client roles and legacy storage remain isolated", async () => {
      const connection = await pool.connect();
      try {
        await sql("INSERT INTO storage.objects(bucket_id) VALUES('purchase-private')");
        await connection.query("SET ROLE authenticated");
        await assert.rejects(connection.query("SELECT * FROM purchase_requisitions"), { code: "42501" });
        await assert.rejects(connection.query("SELECT purchase_snapshot(gen_random_uuid())"), { code: "42501" });
        assert.equal((await connection.query("SELECT bucket_id FROM storage.objects WHERE bucket_id='purchase-private'")).rowCount, 0);
        assert.equal((await connection.query("SELECT bucket_id FROM storage.objects WHERE bucket_id='existing-business-bucket'")).rowCount, 1);
        await connection.query("RESET ROLE");
        assert.equal((await sql("SELECT note FROM legacy_booking_fixture")).rows[0].note, "must remain unchanged");
      } finally {
        await connection.query("RESET ROLE");
        connection.release();
      }
    });

    await t.test("creates exact totals, atomic Gregorian numbers, idempotent create and filtered brand list", async () => {
      await Promise.all([save(doc), save(doc), ...Array.from({ length: 10 }, () => save(draft("adisorn")))]);
      const row = await read(doc.id);
      assert.match(row.number, /^PR-\d{8}-\d{4}$/);
      assert.match(row.number, /^PR-20/);
      assert.equal(row.total, "60.85");
      const result = await call("list", "pharadol", "ทดสอบ", null, null, null, "total", false, 1);
      assert.equal(result.count, 1);
      assert.equal(result.items[0].total, "60.85");
      assert.equal((await call("list", "adisorn", "", null, null, null, "number", true, 1)).count, 10);
      assert.equal((await sql("SELECT count(DISTINCT number)::int AS count FROM purchase_requisitions")).rows[0].count, 11);
      assert.equal((await call("list", "pharadol", "%", null, null, null, "number", false, 1)).count, 0);
      await assert.rejects(call("mutate", "adisorn", doc.id, actor, "submit", { version: row.version }), { code: "P0002" });
      await assert.rejects(mutate(doc, "submit"), { code: "23514" });
      assert.equal((await read(doc.id)).status, "draft");
    });

    const photo = randomUUID(), quote = randomUUID();
    let first, second;
    await t.test("private attachment metadata and immutable route snapshot on submit", async () => {
      await mutate(doc, "file_add", { id: photo, kind: "product", item_id: doc.items[0].id, name: "สินค้า.png", mime: "image/png", bytes: 20 });
      await mutate(doc, "file_add", { id: quote, kind: "quotation", name: "ใบเสนอราคา.pdf", mime: "application/pdf", bytes: 100 });
      await approver("pharadol", 1, "first@example.invalid");
      const executiveId = await approver("pharadol", 2, "executive@example.invalid");
      await mutate(doc, "submit");
      [first, second] = await Promise.all([step(doc, 1), step(doc, 2)]);
      assert.equal(first.status, "pending");
      assert.equal(second.status, "queued");
      assert.equal((await call("list", "pharadol", "", null, null, null, "created_at", false, 1)).pending, 1);
      await approver("pharadol", 2, "updated@example.invalid", executiveId);
      assert.equal((await step(doc, 2)).email, "executive@example.invalid");
      assert.equal((await call("snapshot", doc.id)).files.length, 2);
      await assert.rejects(save(doc, (await read(doc.id)).version), { code: "40001" });
      await assert.rejects(mutate(doc, "file_remove", { id: photo }), { code: "23514" });
    });

    await t.test("email claim lease, idempotent retry and stable provider payload", async () => {
      const email = (await sql("SELECT id FROM purchase_email_outbox WHERE step_id=$1", [first.id])).rows[0];
      const claims = await Promise.all(Array.from({ length: 5 }, () => call("email_claim", email.id, { text: "fixture" }, true)));
      assert.equal(claims.filter(Boolean).length, 1);
      const [firstClaim] = claims.filter(Boolean);
      await call("email_finish", email.id, firstClaim.attempt_key, null, "resend_503");
      const secondClaim = await call("email_claim", email.id, { text: "changed" }, true);
      assert.equal(secondClaim.message.text, "fixture");
      await call("email_finish", email.id, secondClaim.attempt_key, "provider-test", null);
      assert.equal(await call("email_claim", email.id, {}, true), null);
    });

    await t.test("OTP request cooldown, wrong attempts, expiry, single use, sequence and racing decisions", async () => {
      assert.equal(await otp(second, "request", "early"), "invalid");
      assert.equal(await otp(first, "request", "old"), "sent");
      assert.equal(await otp(first, "request", "two"), "limited");
      for (let i = 0; i < 5; i++) assert.equal(await otp(first, "verify", "wrong"), "wrong");
      assert.equal(await otp(first, "verify", "old", randomUUID()), "limited");
      await sql("UPDATE purchase_otp_challenges SET expires_at=now()-interval '1 second',sent_at=now()-interval '61 seconds' WHERE step_id=$1", [first.id]);
      assert.equal(await otp(first, "verify", "old", randomUUID()), "expired");
      const session = await makeSession(first);
      assert.equal(await otp(first, "verify", "hash", randomUUID()), "expired");
      const decisions = await Promise.allSettled([call("review", session, "approved", "ผ่าน"), call("review", session, "approved", "ซ้ำ")]);
      assert.equal(decisions.filter(({ status }) => status === "fulfilled").length, 1);
      assert.equal(decisions.find(({ status }) => status === "rejected").reason.code, "42501");
      const final = await step(doc, 2);
      assert.equal(final.status, "pending");
      assert.equal((await read(doc.id)).status, "pending");
      const finalSession = await makeSession(final);
      await call("review", finalSession, "approved", "อนุมัติฉบับเต็ม");
      assert.equal((await read(doc.id)).status, "approved");
      assert.equal((await read(doc.id)).approved_total, "60.85");
      assert.equal((await sql("SELECT count(*)::int AS n FROM purchase_email_outbox WHERE requisition_id=$1 AND kind='result'", [doc.id])).rows[0].n, 2);
    });

    await t.test("overage opens a new round, cannot close early, and preserves the purchase receipt", async () => {
      await mutate(doc, "start");
      const receipt = randomUUID();
      await mutate(doc, "file_add", { id: receipt, kind: "receipt", name: "ใบเสร็จ.png", mime: "image/png", bytes: 200 });
      const entry = { purchased_on: date, paid_on: date, vendor: "ผู้ขายทดสอบ", method: "โอนเงิน", receipt_id: receipt,
        receipt_number: "TEST-1", notes: "", actual_total: "65.00" };
      const summary = await mutate(doc, "payment", entry);
      assert.equal((await read(doc.id)).status, "overage_pending");
      await assert.rejects(mutate(doc, "payment", entry), { code: "23514" });
      const payment = (await sql("SELECT * FROM purchase_payments WHERE id=$1", [summary.payment_id])).rows[0];
      assert.equal(payment.difference, "4.15");
      assert.equal(payment.receipt_id, receipt);
      const current = await step(doc, 1);
      await call("review", await makeSession(current), "rejected", "ปรับยอด");
      assert.equal((await read(doc.id)).status, "purchasing");
      await mutate(doc, "payment", { ...entry, actual_total: "65.25" });
      await call("review", await makeSession(await step(doc, 1)), "approved", "");
      assert.equal((await read(doc.id)).status, "overage_pending");
      await call("review", await makeSession(await step(doc, 2)), "approved", "");
      assert.equal((await read(doc.id)).status, "completed");
      assert.equal((await read(doc.id)).approved_total, "65.25");
    });

    await t.test("inventory handoff is atomic and repeatable and preserves existing stock", async () => {
      const options = await call("equipment_options", doc.id, "");
      const category = options.categories[0].id;
      const entry = { item_id: doc.items[0].id, category_id: category, unit_price: "13.00", serial_number: "TEST-SERIAL" };
      // pg serializes a JavaScript array as a Postgres array, so use the JSON representation here.
      const results = await Promise.all([call("into_equipment", doc.id, actor, JSON.stringify([entry])),
        call("into_equipment", doc.id, actor, JSON.stringify([entry]))]);
      assert.deepEqual(results[0], results[1]);
      const existing = (await sql("SELECT id,quantity,version FROM equipment WHERE serial_number='TEST-SERIAL'")).rows[0];
      assert.equal(existing.quantity, 1);
      const linked = await call("into_equipment", doc.id, actor,
        JSON.stringify([{ item_id: doc.items[1].id, equipment_id: existing.id, serial_number: "TEST-SERIAL" }]));
      assert.equal(linked.length, 2);
      assert.deepEqual((await sql("SELECT id,quantity,version FROM equipment WHERE id=$1", [existing.id])).rows[0], existing);
      assert.equal((await sql("SELECT count(*)::int n FROM equipment")).rows[0].n, 1);
    });

    await t.test("return for edit preserves historical snapshot, resets workflow and cancellation never reuses numbers", async () => {
      const another = draft("pharadol");
      await save(another);
      await mutate(another, "submit");
      await call("review", await makeSession(await step(another, 1)), "returned", "เพิ่มเหตุผล");
      assert.equal((await read(another.id)).status, "returned");
      await save({ ...another, purpose: "แก้ไขเอกสารใหม่" }, (await read(another.id)).version);
      await mutate(another, "submit");
      const snapshots = (await sql("SELECT snapshot FROM purchase_approval_rounds WHERE requisition_id=$1 ORDER BY round", [another.id])).rows;
      assert.equal(snapshots[0].snapshot.document.purpose, another.purpose);
      assert.equal(snapshots[1].snapshot.document.purpose, "แก้ไขเอกสารใหม่");
      const number = (await read(another.id)).number;
      const pending = await step(another, 1);
      await mutate(another, "cancel");
      assert.equal((await read(another.id)).status, "cancelled");
      assert.equal(await otp(pending, "request", "cancelled"), "invalid");
      const next = draft("pharadol");
      await save(next);
      assert.notEqual((await read(next.id)).number, number);
    });
  } finally {
    await fixture.close();
  }
});

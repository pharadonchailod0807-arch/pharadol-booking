import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  validateMutation,
  inventoryParams,
} from "../../lib/equipment/validation.ts";
import { equipmentPermissions } from "../../lib/equipment/access.ts";
import { exportRows, equipmentPdfHtml } from "../../lib/equipment/export.ts";
const valid = {
  name: "กล้องทดสอบ",
  category_id: randomUUID(),
  quantity: 1,
  purchase_price: 50000,
  unit: "ชิ้น",
  initial_status: "available",
};
test("equipment validates real serial units and rejects fractional/negative/overflow quantities", () => {
  for (const quantity of [0, -1, 1.5, "1", Infinity, 1000001, null])
    assert.throws(() => validateMutation("create", { ...valid, quantity }));
  assert.equal(
    validateMutation("create", { ...valid, serial_number: "FX3-001" }).quantity,
    1,
  );
  assert.throws(() =>
    validateMutation("create", {
      ...valid,
      quantity: 2,
      serial_number: "FX3-001",
    }),
  );
});
test("equipment rejects unsafe prices, impossible dates, missing references and foreign brands", () => {
  for (const purchase_price of [-1, NaN, Infinity, "10", 1.234])
    assert.throws(() =>
      validateMutation("create", { ...valid, purchase_price }),
    );
  for (const purchase_date of ["2026-02-30", "not-date", "2569-01-01"])
    assert.throws(() =>
      validateMutation("create", { ...valid, purchase_date }),
    );
  assert.throws(() =>
    validateMutation("create", { ...valid, category_id: "bad" }),
  );
  assert.throws(() =>
    validateMutation("create", { ...valid, brand: "adisorn" }),
  );
  assert.throws(() =>
    validateMutation("create", { ...valid, initial_status: "in_use" }),
  );
  assert.throws(() =>
    validateMutation("create", {
      ...valid,
      purchase_date: "2026-01-01",
      warranty_expiration: "2025-01-01",
    }),
  );
});
test("checkout validation rejects empty, duplicated and invalid items", () => {
  const base = {
    borrower: "ทีมงาน",
    checkout_date: "2026-11-09",
    expected_return_date: "2026-11-10",
    items: [],
  };
  assert.throws(() => validateMutation("checkout", base));
  const i = { equipment_id: randomUUID(), quantity: 1 };
  assert.throws(() => validateMutation("checkout", { ...base, items: [i, i] }));
  assert.throws(() =>
    validateMutation("checkout", { ...base, items: [{ ...i, quantity: 0 }] }),
  );
  assert.throws(() =>
    validateMutation("checkout", {
      ...base,
      items: [i],
      expected_return_date: "2026-11-08",
    }),
  );
  assert.equal(
    validateMutation("checkout", { ...base, items: [i] }).items.length,
    1,
  );
});
test("return and maintenance validation enforce conditions and completion dates", () => {
  assert.throws(() =>
    validateMutation("return", {
      item_id: randomUUID(),
      quantity: 1,
      condition: "lost",
      return_date: "2026-11-09",
    }),
  );
  assert.throws(() =>
    validateMutation("maintenance_update", {
      id: randomUUID(),
      status: "completed",
      cost: 0,
    }),
  );
  assert.throws(() =>
    validateMutation("maintenance_create", {
      equipment_id: randomUUID(),
      quantity: 1,
      source: "in_use",
      issue: "ซ่อม",
      reported_date: "2026-11-09",
    }),
  );
});
test("brand and role isolation: no anonymous, Adisorn, disabled or viewer mutation", () => {
  for (const user of [
    null,
    { role: "STAFF", brands: ["adisorn"] },
    { role: "STAFF", brands: ["pharadol"], active: false },
  ])
    assert.deepEqual(equipmentPermissions(user), {
      read: false,
      write: false,
      admin: false,
    });
  assert.deepEqual(
    equipmentPermissions({ role: "VIEWER", brands: ["pharadol"] }),
    { read: true, write: false, admin: false },
  );
  assert.deepEqual(
    equipmentPermissions({ role: "STAFF", brands: ["pharadol"] }),
    { read: true, write: true, admin: false },
  );
  for (const role of ["BRAND_ADMIN", "MANAGER", "ADMIN"])
    assert.equal(
      equipmentPermissions({ role, brands: ["pharadol"] }).admin,
      true,
    );
  assert.equal(
    equipmentPermissions({
      role: "ADMIN",
      deniedPermissions: ["equipment.write"],
    }).write,
    false,
  );
  assert.equal(
    equipmentPermissions({ role: "ADMIN", deniedPermissions: ["*"] }).read,
    false,
  );
});
test("search filters and sort columns are constrained and paginated", () => {
  for (const sort of [
    "code",
    "name",
    "category",
    "quantity",
    "purchase_date",
    "status",
  ])
    assert.ok(inventoryParams(new URLSearchParams({ sort })).sort);
  assert.equal(
    inventoryParams(new URLSearchParams({ sort: "password" })).sort,
    "sequence_number",
  );
  assert.equal(
    inventoryParams(new URLSearchParams({ direction: "desc", page: "3" }))
      .ascending,
    false,
  );
  assert.equal(inventoryParams(new URLSearchParams({ page: "3" })).page, 3);
  assert.throws(() =>
    inventoryParams(new URLSearchParams({ category: "fake" })),
  );
  assert.ok(
    !inventoryParams(
      new URLSearchParams({ search: "x),brand.eq.adisorn" }),
    ).search.includes(","),
  );
});
test("export preserves Thai, unit purchase prices and escapes executable markup", () => {
  const equipment = {
    equipment_code: "EQ-0001",
    name: "กล้อง <script>alert(1)</script>",
    category_name: "กล้อง",
    manufacturer: "Sony",
    model: "FX3",
    serial_number: "001",
    quantity: 2,
    available: 2,
    in_use: 0,
    maintenance: 0,
    damaged: 0,
    retired: 0,
    status: "available",
    purchase_price: 100,
    purchase_date: "2026-11-09",
    storage_location: "กรุงเทพฯ",
  };
  const rows = exportRows([equipment]);
  assert.equal(rows[0][14], 200);
  assert.equal(rows[0][1], equipment.name);
  const html = equipmentPdfHtml([equipment], "font");
  assert.ok(html.includes("กล้อง"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

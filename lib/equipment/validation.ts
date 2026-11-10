export class EquipmentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export type Payload = Record<string, unknown>;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new EquipmentError("รหัสอ้างอิงไม่ถูกต้อง");
  return value;
}
function text(value: unknown, max = 200, required = false): string {
  if (value != null && typeof value !== "string")
    throw new EquipmentError("รูปแบบข้อความไม่ถูกต้อง");
  const s = String(value ?? "")
    .replace(/\u0000/g, "")
    .trim();
  if (s.length > max || (required && !s))
    throw new EquipmentError(
      `กรุณาระบุข้อมูลให้ครบถ้วน (ไม่เกิน ${max} ตัวอักษร)`,
    );
  return s;
}
function integer(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 1000000
  )
    throw new EquipmentError("จำนวนต้องเป็นจำนวนเต็มระหว่าง 1–1,000,000");
  return value;
}
function money(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 999999999999.99 ||
    Math.abs(Math.round(value * 100) - value * 100) > 0.02
  )
    throw new EquipmentError("จำนวนเงินไม่ถูกต้อง (ทศนิยมไม่เกิน 2 ตำแหน่ง)");
  return value;
}
function date(value: unknown, required = false): string {
  const s = text(value, 10, required);
  if (!s && !required) return "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s ||
    s < "1900-01-01" ||
    s > "2200-12-31"
  )
    throw new EquipmentError("วันที่ไม่ถูกต้อง");
  return s;
}
function choice(value: unknown, allowed: string[]): string {
  if (typeof value !== "string" || !allowed.includes(value))
    throw new EquipmentError("สถานะไม่ถูกต้อง");
  return value;
}
export function validateMutation(action: string, raw: unknown): Payload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new EquipmentError("ข้อมูลไม่ถูกต้อง");
  const p = raw as Payload;
  if (p.brand !== undefined && p.brand !== "pharadol")
    throw new EquipmentError("Equipment ใช้งานได้เฉพาะ Pharadol", 403);
  const notes = () => text(p.notes, 4000);
  const range = (from: string, to: string) => {
    if (from && to && to < from)
      throw new EquipmentError("วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น");
  };
  switch (action) {
    case "create":
    case "update": {
      const quantity = integer(p.quantity),
        serial = text(p.serial_number, 160);
      if (serial && quantity !== 1)
        throw new EquipmentError(
          "อุปกรณ์ที่มี Serial Number ต้องบันทึกแยกรายชิ้น (จำนวน 1)",
        );
      const purchase_date = date(p.purchase_date),
        warranty_expiration = date(p.warranty_expiration);
      range(purchase_date, warranty_expiration);
      return {
        brand: "pharadol",
        ...(action === "update"
          ? { id: uuid(p.id), version: integer(p.version) }
          : {
              initial_status: choice(p.initial_status, [
                "available",
                "damaged",
                "retired",
              ]),
            }),
        name: text(p.name, 200, true),
        category_id: uuid(p.category_id),
        manufacturer: text(p.manufacturer),
        model: text(p.model),
        serial_number: serial,
        description: text(p.description, 4000),
        quantity,
        unit: text(p.unit, 40, true),
        storage_location: text(p.storage_location),
        purchase_date,
        purchase_price: money(p.purchase_price),
        supplier: text(p.supplier),
        warranty_expiration,
      };
    }
    case "archive":
    case "restore":
      return { id: uuid(p.id) };
    case "stock_adjust":
      return {
        id: uuid(p.id),
        quantity: integer(p.quantity),
        source: choice(p.source, ["available", "damaged", "retired"]),
        condition: choice(p.condition, ["available", "damaged", "retired"]),
      };
    case "category_save":
      if (p.id && typeof p.active !== "boolean")
        throw new EquipmentError("กรุณาระบุสถานะหมวดหมู่");
      return {
        name: text(p.name, 120, true),
        ...(p.id ? { id: uuid(p.id), active: p.active } : {}),
      };
    case "checkout": {
      if (!Array.isArray(p.items) || !p.items.length || p.items.length > 100)
        throw new EquipmentError("กรุณาเลือกอุปกรณ์ 1–100 รายการ");
      const seen = new Set();
      const items = p.items.map((v: unknown) => {
        if (!v || typeof v !== "object")
          throw new EquipmentError("รายการอุปกรณ์ไม่ถูกต้อง");
        const item = v as Payload,
          equipment_id = uuid(item.equipment_id);
        if (seen.has(equipment_id))
          throw new EquipmentError("เลือกอุปกรณ์ซ้ำในใบเบิก");
        seen.add(equipment_id);
        return { equipment_id, quantity: integer(item.quantity) };
      });
      const checkout_date = date(p.checkout_date, true),
        expected_return_date = date(p.expected_return_date, true);
      range(checkout_date, expected_return_date);
      return {
        borrower: text(p.borrower, 200, true),
        related_booking: text(p.related_booking, 160),
        checkout_date,
        expected_return_date,
        notes: notes(),
        items,
      };
    }
    case "return":
      return {
        item_id: uuid(p.item_id),
        quantity: integer(p.quantity),
        condition: choice(p.condition, ["available", "damaged", "maintenance"]),
        return_date: date(p.return_date, true),
        notes: notes(),
      };
    case "maintenance_create": {
      const reported_date = date(p.reported_date, true),
        start_date = date(p.start_date);
      range(reported_date, start_date);
      return {
        equipment_id: uuid(p.equipment_id),
        quantity: integer(p.quantity),
        source: choice(p.source, ["available", "damaged"]),
        issue: text(p.issue, 4000, true),
        reported_date,
        start_date,
        service_provider: text(p.service_provider),
        notes: notes(),
      };
    }
    case "maintenance_update": {
      const status = choice(p.status, [
        "pending",
        "in_progress",
        "completed",
        "cancelled",
      ]);
      const start_date = date(p.start_date),
        completion_date = date(p.completion_date, status === "completed");
      range(start_date, completion_date);
      return {
        id: uuid(p.id),
        status,
        start_date,
        completion_date,
        service_provider: text(p.service_provider),
        cost: money(p.cost),
        notes: notes(),
      };
    }
    default:
      throw new EquipmentError("ไม่รองรับรายการนี้");
  }
}
export const SORT_COLUMNS: Record<string, string> = {
  code: "sequence_number",
  name: "name",
  category: "category_name",
  quantity: "quantity",
  purchase_date: "purchase_date",
  status: "status",
};
export function inventoryParams(params: URLSearchParams) {
  const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
  if (!Number.isInteger(page)) throw new EquipmentError("หน้ารายการไม่ถูกต้อง");
  const category = params.get("category") || "";
  if (category) uuid(category);
  const status = params.get("status") || "";
  if (status)
    choice(status, [
      "available",
      "in_use",
      "maintenance",
      "damaged",
      "retired",
    ]);
  return {
    page,
    pageSize: 20,
    search: text(params.get("search"), 120)
      .replace(/[%_(),.\\"']/g, " ")
      .trim(),
    category,
    status,
    sort: SORT_COLUMNS[params.get("sort") || "code"] || "sequence_number",
    ascending: params.get("direction") !== "desc",
    archived: params.get("archived") === "1",
  };
}

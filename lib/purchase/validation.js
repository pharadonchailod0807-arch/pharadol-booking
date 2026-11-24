import { decimal, emailPattern, fileLimit, lineMinor, minor, purchaseDate, uuidPattern } from "./data.js";

export class PurchaseError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const invariant = (condition, message, status) => {
  if (!condition) throw new PurchaseError(message, status);
};

export function string(value, limit, label, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  invariant((!required || text.length) && text.length <= limit && !text.includes("\0"),
    `ตรวจสอบข้อมูล${label} (ไม่เกิน ${limit} ตัวอักษร)`);
  return text;
}

export function id(value) {
  invariant(typeof value === "string" && uuidPattern.test(value), "ไม่พบรายการที่ระบุ", 404);
  return value.toLowerCase();
}

export function version(value) {
  const n = Number(value);
  invariant(Number.isInteger(n) && n > 0 && n <= 2147483647, "กรุณาโหลดเอกสารใหม่");
  return n;
}

export function email(value) {
  const result = string(value, 254, "อีเมล", true).toLowerCase();
  invariant(emailPattern.test(result), "รูปแบบอีเมลไม่ถูกต้อง");
  return result;
}

export function date(value, required = false) {
  if (!value && !required) return null;
  const normalized = purchaseDate(value);
  invariant(normalized, "วันที่ไม่ถูกต้อง กรุณากรอก วัน/เดือน/ปี หรือ ปี-เดือน-วัน");
  return normalized;
}

function amount(value, label, { scale = 2, digits = 9, positive = false } = {}) {
  const result = decimal(value, scale, digits);
  invariant(result && (!positive || minor(result, scale) > 0n), `ตรวจสอบ${label}`);
  return result;
}

function productUrl(raw) {
  const value = string(raw, 1500, "ลิงก์สินค้า");
  if (!value) return "";
  const parsed = URL.canParse(value) ? new URL(value) : null;
  invariant(parsed && ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password,
    "ลิงก์สินค้าต้องเป็น HTTP หรือ HTTPS");
  return parsed.href;
}

export function requisitionInput(input, update) {
  invariant(Array.isArray(input.items) && input.items.length >= 1 && input.items.length <= 60,
    "เพิ่มรายการสินค้า 1 ถึง 60 รายการ");
  const items = input.items.map((item, index) => ({
    id: id(item?.id),
    position: index + 1,
    name: string(item.name, 200, "ชื่อสินค้า", true),
    description: string(item.description, 1500, "รายละเอียดสินค้า"),
    quantity: amount(item.quantity, "จำนวนสินค้า", { scale: 3, digits: 6, positive: true }),
    unit: string(item.unit, 40, "หน่วยนับ", true),
    unit_price: amount(item.unit_price, "ราคาต่อหน่วย"),
    vendor: string(item.vendor, 200, "ชื่อร้านค้า"),
    url: productUrl(item.url),
    notes: string(item.notes, 1500, "หมายเหตุสินค้า"),
  }));
  invariant(new Set(items.map((item) => item.id)).size === items.length, "พบรหัสรายการสินค้าซ้ำ");
  const shipping = amount(input.shipping ?? "0", "ค่าจัดส่ง");
  const discount = amount(input.discount ?? "0", "ส่วนลด");
  const vat = amount(input.vat ?? "0", "ภาษีมูลค่าเพิ่ม");
  const subtotal = items.reduce((sum, item) => sum + lineMinor(item.quantity, item.unit_price), 0n);
  invariant(minor(discount) <= subtotal + minor(shipping) + minor(vat), "ส่วนลดสูงกว่ายอดรวม");
  return {
    items, shipping, discount, vat,
    purpose: string(input.purpose, 250, "วัตถุประสงค์", true),
    reason: string(input.reason, 2500, "เหตุผลความจำเป็น", true),
    needed_on: date(input.needed_on),
    notes: string(input.notes, 2500, "หมายเหตุ"),
    ...(update ? { version: version(input.version) } : {}),
  };
}

export function approverInput(input) {
  const level = Number(input.level);
  invariant(Number.isInteger(level) && level >= 1 && level <= 20, "ระบุระดับอนุมัติ 1 ถึง 20");
  invariant(typeof input.active === "boolean", "ระบุสถานะผู้อนุมัติ");
  return {
    id: input.id ? id(input.id) : null, level, active: input.active,
    name: string(input.name, 160, "ชื่อผู้อนุมัติ", true),
    position: string(input.position, 160, "ตำแหน่ง", true),
    email: email(input.email),
  };
}

export function paymentInput(input) {
  const purchased_on = date(input.purchased_on, true);
  const paid_on = date(input.paid_on, true);
  return {
    purchased_on, paid_on,
    vendor: string(input.vendor, 200, "ร้านค้าที่ซื้อจริง", true),
    actual_total: amount(input.actual_total, "ยอดซื้อจริง", { positive: true, digits: 15 }),
    method: string(input.method, 80, "วิธีชำระเงิน", true),
    receipt_number: string(input.receipt_number, 120, "เลขที่ใบเสร็จ"),
    receipt_id: input.receipt_id ? id(input.receipt_id) : null,
    notes: string(input.notes, 2500, "หมายเหตุการชำระเงิน"),
  };
}

export function inventoryInput(input) {
  invariant(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 60, "เลือกรายการอุปกรณ์เข้าคลัง");
  return input.items.map((item) => {
    const result = { item_id: id(item.item_id), serial_number: string(item.serial_number, 160, "Serial Number") };
    if (item.equipment_id) return { ...result, equipment_id: id(item.equipment_id) };
    return { ...result, category_id: id(item.category_id), unit_price: amount(item.unit_price, "ราคาซื้อจริงต่อหน่วย") };
  });
}

export function fileInfo(buf, reported, kind) {
  invariant(buf.length > 0 && buf.length <= fileLimit, "ไฟล์ต้องมีขนาดไม่เกิน 3 MB", 413);
  const mime = buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? "image/png"
    : buf.subarray(0, 3).toString("hex") === "ffd8ff" ? "image/jpeg"
      : buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP" ? "image/webp"
        : buf.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : "";
  invariant(mime && mime === reported && (kind !== "product" || mime !== "application/pdf"),
    "ใช้ไฟล์ JPG, PNG, WebP หรือ PDF ตามประเภทเอกสาร", 415);
  return mime;
}

export const statuses = {
  draft: "ฉบับร่าง",
  pending: "รออนุมัติ",
  returned: "ส่งกลับแก้ไข",
  rejected: "ไม่อนุมัติ",
  approved: "อนุมัติแล้ว",
  purchasing: "กำลังจัดซื้อ",
  overage_pending: "รออนุมัติยอดเพิ่มเติม",
  completed: "จัดซื้อสำเร็จ",
  cancelled: "ยกเลิก",
  queued: "รอถึงลำดับ",
  accepted: "บันทึกสำเร็จ",
};

export const emailStatuses = {
  pending: "รอส่ง",
  sending: "กำลังส่ง",
  failed: "ส่งไม่สำเร็จ",
  sent: "ผู้ให้บริการรับอีเมลแล้ว",
  needs_review: "รอตรวจสอบการส่ง",
  cancelled: "ยกเลิกการส่ง",
};

export const stages = { 1: "หัวหน้างาน", 2: "ผู้บริหาร" };
export const fileTypes = { product: "รูปสินค้า", quotation: "ใบเสนอราคา", receipt: "ใบเสร็จ" };
export const fileLimit = 3 * 1024 * 1024;
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function purchaseDate(raw) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(raw || "").trim());
  const thai = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(raw || "").trim());
  if (!match && !thai) return null;
  let year = Number(match?.[1] || thai[3]);
  const month = Number(match?.[2] || thai[2]);
  const day = Number(match?.[3] || thai[1]);
  if (year >= 2400) year -= 543;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = month === 2 && leap ? 29 : monthDays[month - 1];
  if (year < 1900 || year > 2399 || !maxDay || day < 1 || day > maxDay) return null;
  return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

export function decimal(raw, scale, whole = 10) {
  const str = String(raw ?? "").trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match || match[1].length > whole || (match[2]?.length || 0) > scale) return null;
  return match[1] + "." + (match[2] || "").padEnd(scale, "0");
}

export function minor(raw, scale = 2, whole = 16) {
  const normalized = decimal(raw, scale, whole);
  return normalized === null ? null : BigInt(normalized.replace(".", ""));
}

export const lineMinor = (quantity, unitPrice) =>
  ((minor(quantity, 3) || 0n) * (minor(unitPrice) || 0n) + 500n) / 1000n;

export function moneyText(cents) {
  const sign = cents < 0n ? "-" : "";
  const amount = (cents < 0n ? -cents : cents).toString().padStart(3, "0");
  return sign + amount.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + amount.slice(-2);
}

export const money = (value) => {
  if (value == null) return "—";
  const raw = String(value);
  const cents = minor(raw.replace(/^-/, ""));
  return cents == null ? "—" : moneyText(raw.startsWith("-") ? -cents : cents);
};

export function bangkokToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format();
}

export function thaiDate(raw, withTime = false) {
  if (!raw) return "—";
  const value = new Date(String(raw).length === 10 ? raw + "T00:00:00+07:00" : raw);
  if (!Number.isFinite(value.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    timeZone: "Asia/Bangkok", dateStyle: "medium", ...(withTime ? { timeStyle: "short" } : {}),
  }).format(value);
}

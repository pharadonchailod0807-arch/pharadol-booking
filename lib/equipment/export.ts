import type { Equipment } from "./types";
export const exportColumns = [
  "Equipment ID",
  "ชื่ออุปกรณ์",
  "หมวดหมู่",
  "ยี่ห้อ",
  "รุ่น",
  "Serial Number",
  "จำนวนทั้งหมด",
  "พร้อมใช้งาน",
  "กำลังใช้งาน",
  "ส่งซ่อม",
  "ชำรุด",
  "ปลดระวาง",
  "สถานะ",
  "ราคาซื้อต่อหน่วย (บาท)",
  "มูลค่าซื้อรวม (บาท)",
  "วันที่ซื้อ",
  "สถานที่จัดเก็บ",
];
export function exportRows(rows: Equipment[]) {
  return rows.map((e) => [
    e.equipment_code,
    e.name,
    e.category_name,
    e.manufacturer,
    e.model,
    e.serial_number || "",
    e.quantity,
    e.available,
    e.in_use,
    e.maintenance,
    e.damaged,
    e.retired,
    e.status,
    Number(e.purchase_price),
    Number(e.purchase_price) * e.quantity,
    e.purchase_date || "",
    e.storage_location,
  ]);
}
export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function equipmentPdfHtml(rows: Equipment[], font: string) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>@font-face{font-family:Thai;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{font:9px Thai,sans-serif;color:#17291f}h1{font-size:22px}p{color:#58655c}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:6px 4px;text-align:left;vertical-align:top;overflow-wrap:anywhere;border-bottom:1px solid #dce3dc}th{background:#edf1ec}thead{display:table-header-group}tr{break-inside:avoid}th:nth-child(2){width:12%}</style></head><body><h1>PHARADOL PRODUCTION · Equipment</h1><p>ทะเบียนคลังอุปกรณ์ · ${rows.length} รายการ · ราคาซื้อและมูลค่าซื้อรวม (ไม่ใช่มูลค่าประเมินปัจจุบัน)</p><table><thead><tr>${exportColumns.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${exportRows(
    rows,
  )
    .map(
      (r) => `<tr>${r.map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table></body></html>`;
}

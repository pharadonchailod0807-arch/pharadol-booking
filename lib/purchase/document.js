import JsBarcode from "jsbarcode";
import { BRAND_DOCUMENTS } from "../../app/lib/brandDocuments.js";
import { money, statuses, thaiDate } from "./data.js";

const escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => escapes[character]);
const display = (value) => escapeHtml(value || "—");
const pair = (label, value) => `<div><dt>${label}</dt><dd>${display(value)}</dd></div>`;

function barcode(value) {
  const barcode = {};
  JsBarcode(barcode, value, { format: "CODE128", displayValue: false });
  const bits = barcode.encodings.flatMap((encoding) => [...encoding.data]);
  return `<svg class="pr-barcode" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bits.length + 20} 30">
    ${bits.map((bit, x) => bit === "1" ? `<rect x="${x + 10}" y="0" width="1" height="30"/>` : "").join("")}</svg>`;
}

export function documentHtml(data, { logo, image, print = false }) {
  const { document: doc, items, files, steps, payment } = data;
  const brand = BRAND_DOCUMENTS[doc.brand];
  return `<article class="pr-document">
    <header class="pr-letterhead">
      <div class="pr-company"><img src="${escapeHtml(logo || brand.logo)}" alt="">
        <div><strong>${escapeHtml(brand.name)}</strong>
          ${brand.eyebrow ? `<span>${escapeHtml(brand.eyebrow)}</span>` : ""}
          <small>${escapeHtml(brand.address)}<br>${escapeHtml(brand.phone)} · ${escapeHtml(brand.email)}</small>
        </div>
      </div>
      <div class="pr-reference">${barcode(doc.number)}<b>${display(doc.number)}</b><span>${display(thaiDate(doc.created_at))}</span></div>
    </header>
    <div class="pr-document-title"><h2>ใบเสนอขออนุมัติจัดซื้อ</h2><p>PURCHASE REQUISITION</p></div>
    <dl class="pr-doc-fields">
      ${pair("ชื่อผู้เสนอ", doc.proposer)}
      ${pair("สถานะ", statuses[doc.status])}
      ${pair("วัตถุประสงค์", doc.purpose)}
      ${pair("วันที่ต้องการใช้งาน", thaiDate(doc.needed_on))}
      ${pair("เหตุผลความจำเป็น", doc.reason)}
      ${pair("หมายเหตุ", doc.notes)}
    </dl>
    <table class="pr-line-table">
      <thead><tr><th scope="col">รายการสินค้า</th><th scope="col">จำนวน</th><th scope="col">ราคาต่อหน่วย</th><th scope="col">ราคารวม</th></tr></thead>
      <tbody>${items.map((item) => {
        const file = files.find((candidate) => candidate.kind === "product" && candidate.item_id === item.id);
        const src = file && image(file);
        const url = /^(https?):\/\//i.test(item.url || "") ? item.url : "";
        return `<tr><td><div class="pr-product">
          ${src ? `<img src="${escapeHtml(src)}" alt="">` : ""}
          <div class="pr-product-copy"><b>${display(item.name)}</b>
            ${[item.description, item.vendor, item.notes].filter(Boolean).map((value) => `<div>${display(value)}</div>`).join("")}
            ${url && !print ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">เปิดลิงก์สินค้า</a>` : ""}
          </div></div></td>
          <td>${display(String(item.quantity).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""))} ${display(item.unit)}</td><td>${money(item.unit_price)}</td><td>${money(item.line_total)}</td></tr>`;
      }).join("")}</tbody>
    </table>
    <dl class="pr-totals">
      ${pair("รวมราคาสินค้า", money(doc.items_total))}
      ${pair("ค่าจัดส่ง", money(doc.shipping))}
      ${pair("ส่วนลด", money(doc.discount))}
      ${pair("ภาษีมูลค่าเพิ่ม", money(doc.vat))}
      <div class="pr-net"><dt>ยอดขออนุมัติสุทธิ</dt><dd>฿${money(doc.total)}</dd></div>
      ${doc.approved_total != null ? pair("ยอดที่อนุมัติ", money(doc.approved_total)) : ""}
    </dl>
    ${payment ? `<section class="pr-approvals">
      <h3>ข้อมูลการจัดซื้อและชำระเงิน</h3>
      <dl class="pr-doc-fields">
        ${pair("วันที่จัดซื้อ", thaiDate(payment.purchased_on))}
        ${pair("ร้านค้าที่ซื้อจริง", payment.vendor)}
        ${pair("ยอดที่อนุมัติก่อนบันทึก", money(payment.previous_approved_total))}
        ${pair("ยอดซื้อจริง", money(payment.actual_total))}
        ${pair("ส่วนต่าง", money(payment.difference))}
        ${pair("วิธีชำระเงิน", payment.method)}
        ${pair("วันที่ชำระเงิน", thaiDate(payment.paid_on))}
        ${pair("เลขที่ใบเสร็จ", payment.receipt_number)}
        ${pair("สถานะการบันทึก", statuses[payment.status])}
        ${pair("หมายเหตุการชำระเงิน", payment.notes)}
      </dl>
    </section>` : ""}
    <section class="pr-approvals"><h3>การอนุมัติ</h3>
      ${steps.length ? `<ul>${steps.map((step) => `<li>
        <div><b>ระดับ ${step.level} · ${display(step.name)}</b><span>${display(step.position)}</span></div>
        <div><b>${display(statuses[step.status])}</b><span>${display(thaiDate(step.acted_at, true))}</span></div>
        ${step.comment ? `<p>${display(step.comment)}</p>` : ""}
      </li>`).join("")}</ul>` : "<p>ยังไม่มีขั้นตอนอนุมัติ</p>"}
    </section>
  </article>`;
}

export function selectDocument(data, historical = false) {
  if (historical && data.viewed) {
    return {
      ...data.viewed.snapshot,
      document: { ...data.viewed.snapshot.document, status: roundStatus(data.steps, data.viewed.round) },
      steps: data.steps.filter((step) => step.round === data.viewed.round),
      payment: data.payments.find((entry) => entry.id === data.viewed.payment_id),
    };
  }
  return {
    ...data,
    steps: data.steps.filter((step) => step.round === data.document.round),
    payment: data.payments[0],
  };
}

function roundStatus(steps, round) {
  const statuses = steps.filter((step) => step.round === round).map((step) => step.status);
  return ["rejected", "returned", "pending", "cancelled"].find((status) => statuses.includes(status)) || "approved";
}

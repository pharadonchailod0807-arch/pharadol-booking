import { money } from "./data.js";
import { escapeHtml } from "./document.js";

export function invitationContent({ brand, logo, href, document, items, amount, overage, senderMessage }) {
  const { number, proposer, purpose } = document;
  const amountLabel = overage ? "ยอดขออนุมัติเพิ่มเติม" : "ยอดขออนุมัติ";
  const total = "฿" + money(amount);
  const quantity = (item) => Number(item.quantity).toLocaleString("th-TH", { maximumFractionDigits: 3 });
  const htmlLines = items.map((item) => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;overflow-wrap:anywhere">${escapeHtml(item.name)}</td>
    <td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid #e4e4e7">${quantity(item)} ${escapeHtml(item.unit)}</td>
    <td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid #e4e4e7;white-space:nowrap">${money(item.line_total)}</td>
  </tr>`).join("");
  return {
    text: [
      brand, `ใบตั้งเบิก ${number}`, `ผู้เสนอ ${proposer}`, `วัตถุประสงค์ ${purpose}`,
      "รายการสินค้า", ...items.map((item) => `${item.name} · ${quantity(item)} ${item.unit} · ฿${money(item.line_total)}`),
      `${amountLabel} ${total}`, senderMessage && `ข้อความถึงผู้บริหาร\n${senderMessage}`,
      "ตรวจสอบและพิจารณาอนุมัติ", href, "ลิงก์มีอายุ 3 วัน และต้องยืนยันตัวตนด้วย OTP",
    ].filter(Boolean).join("\n"),
    html: `<div lang="th" style="background:#f4f4f5;color:#18181b;padding:16px;font:15px/1.5 Arial,sans-serif">
      <div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:20px">
        <table role="presentation"><tr><td style="padding-right:12px">
          <img src="${escapeHtml(logo)}" alt="" width="48" height="48" style="display:block;object-fit:contain">
        </td><td><strong>${escapeHtml(brand)}</strong></td></tr></table>
        <h1 style="margin:20px 0 8px;font-size:21px">ขออนุมัติจัดซื้อ</h1>
        <p style="margin:0 0 14px;color:#52525b">${escapeHtml(number)}</p>
        <p style="margin:4px 0"><strong>ผู้เสนอ</strong> ${escapeHtml(proposer)}</p>
        <p style="margin:4px 0;overflow-wrap:anywhere"><strong>วัตถุประสงค์</strong> ${escapeHtml(purpose)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:13px;table-layout:auto">
          <thead><tr><th align="left" scope="col">รายการสินค้า</th><th align="right" scope="col">จำนวน</th><th align="right" scope="col">ราคารวม</th></tr></thead>
          <tbody>${htmlLines}</tbody>
        </table>
        <p style="margin:16px 0;background:#f4f4f5;border-radius:8px;padding:10px 12px"><strong>${amountLabel} ${total}</strong></p>
        ${senderMessage ? `<p style="overflow-wrap:anywhere"><strong>ข้อความถึงผู้บริหาร</strong><br>${escapeHtml(senderMessage).replace(/\r?\n/g, "<br>")}</p>` : ""}
        <p><a href="${escapeHtml(href)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">
          ตรวจสอบและพิจารณาอนุมัติ</a></p>
        <p style="margin-bottom:0;color:#52525b;font-size:13px">ลิงก์มีอายุ 3 วัน และต้องยืนยันตัวตนด้วย OTP</p>
      </div>
    </div>`,
  };
}

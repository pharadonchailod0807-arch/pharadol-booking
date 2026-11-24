"use client";

import { useState } from "react";
import { bangkokToday, minor, money, moneyText } from "@/lib/purchase/data";
import { DateField, ErrorBox, Field, input, panel, post, primary, uploadFile } from "./ui";

const methods = ["โอนเงิน", "เงินสด", "บัตรเครดิต", "พร้อมเพย์", "อื่น ๆ"];

export default function PurchasePayment({ api, doc, receipts, refresh }) {
  const [data, setData] = useState(() => ({
    purchased_on: bangkokToday(), paid_on: bangkokToday(), vendor: "", method: methods[0],
    actual_total: "", receipt_number: "", receipt_id: "", notes: "",
  }));
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState(doc.version);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setData((previous) => ({ ...previous, [key]: value }));
  const actual = minor(data.actual_total);
  const diff = actual == null ? null : actual - minor(doc.approved_total);

  async function save(event) {
    event.preventDefault();
    if (diff > 0n && !window.confirm("ยอดซื้อจริงสูงกว่ายอดอนุมัติ ส่งขออนุมัติยอดเพิ่มเติมหรือไม่?")) return;
    if (diff <= 0n && !window.confirm("ยืนยันยอดและข้อมูลการชำระเงินเพื่อบันทึกการจัดซื้อสำเร็จหรือไม่?")) return;
    setBusy(true);
    setError("");
    try {
      let expected = version;
      let receiptId = data.receipt_id;
      if (file) {
        const uploaded = await uploadFile(api, doc.id, file, "receipt", expected);
        expected = uploaded.version;
        receiptId = uploaded.file_id;
        setVersion(expected);
        set("receipt_id", receiptId);
        setFile(null);
        refresh();
      }
      await post(`${api}/${doc.id}/payment`, { ...data, receipt_id: receiptId, version: expected });
      refresh();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <form className={panel + " space-y-4"} onSubmit={save}>
    <h2 className="text-lg font-semibold">บันทึกการจัดซื้อและชำระเงิน</h2>
    <ErrorBox message={error} />
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <DateField label="วันที่จัดซื้อ" value={data.purchased_on} onChange={(value) => set("purchased_on", value)} required />
      <DateField label="วันที่ชำระเงิน" value={data.paid_on} onChange={(value) => set("paid_on", value)} required />
      <Field label="ร้านค้าที่ซื้อจริง"><input className={input} required maxLength={200} value={data.vendor} onChange={(event) => set("vendor", event.target.value)} /></Field>
      <Field label="ยอดซื้อจริง"><input className={input} inputMode="decimal" required maxLength={18} value={data.actual_total} onChange={(event) => set("actual_total", event.target.value)} /></Field>
      <Field label="วิธีชำระเงิน"><select className={input} value={data.method} onChange={(event) => set("method", event.target.value)}>
        {methods.map((method) => <option key={method}>{method}</option>)}
      </select></Field>
      <Field label="เลขที่ใบเสร็จ"><input className={input} maxLength={120} value={data.receipt_number} onChange={(event) => set("receipt_number", event.target.value)} /></Field>
      <Field label="แนบใบเสร็จ (PDF หรือรูปภาพ สูงสุด 3 MB)"><input className={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf"
        onChange={(event) => setFile(event.target.files[0] || null)} /></Field>
      {receipts.length > 0 && <Field label="ใช้ใบเสร็จที่แนบไว้"><select className={input} value={data.receipt_id} disabled={Boolean(file)}
        onChange={(event) => set("receipt_id", event.target.value)}>
        <option value="">เลือกใบเสร็จ</option>
        {receipts.map((receipt) => <option key={receipt.id} value={receipt.id}>{receipt.name}</option>)}
      </select></Field>}
      <Field label="หมายเหตุ"><textarea className={input} rows={2} maxLength={2500} value={data.notes} onChange={(event) => set("notes", event.target.value)} /></Field>
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 text-sm">
      <div>
        <p>ยอดที่อนุมัติ ฿{money(doc.approved_total)}</p>
        {diff != null && <p className={diff > 0n ? "font-semibold text-amber-900" : "text-zinc-600"}>ส่วนต่าง ฿{moneyText(diff)}</p>}
      </div>
      <button className={primary} disabled={busy}>{diff > 0n ? "ส่งขออนุมัติยอดเพิ่มเติม" : "บันทึกการชำระเงิน"}</button>
    </div>
  </form>;
}

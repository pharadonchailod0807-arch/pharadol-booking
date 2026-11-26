"use client";

import { useState } from "react";
import { money } from "@/lib/purchase/data";
import { approve, button, danger, DocumentView, ErrorBox, Field, FileList, Heading, input, panel, post, primary, usePurchaseData } from "./ui";

const api = "/api/purchase/review";
const decisions = [
  ["approved", "อนุมัติ", approve], ["returned", "ส่งกลับแก้ไข", button], ["rejected", "ไม่อนุมัติ", danger],
];

export default function PurchaseReview() {
  const { data, error, refresh } = usePurchaseData(api);
  const [code, setCode] = useState("");
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [issues, setIssues] = useState("");
  const [busy, setBusy] = useState(false);

  async function action(operation, values = {}) {
    setBusy(true);
    setIssues("");
    try {
      await post(`${api}/${operation}`, values);
      if (operation === "decision") setDone(true);
      if (operation === "request") setSent(true);
      if (operation === "verify") refresh();
    } catch (error) {
      setIssues(error.message);
    } finally {
      setBusy(false);
    }
  }

  function decision(value, label) {
    if (value !== "approved" && !comment.trim()) {
      setIssues("กรุณาระบุความคิดเห็นก่อนส่งผล");
      return;
    }
    if (window.confirm(`ยืนยัน${label}เอกสารนี้หรือไม่?`)) action("decision", { decision: value, comment });
  }

  const doc = data?.data;
  const fileHref = (file) => `${api}/files/${file.id}`;

  return <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-4xl space-y-5">
      <Heading title="อนุมัติจัดซื้อออนไลน์" />
      <ErrorBox message={error || issues} />
      {!data && !error && <p role="status">กำลังตรวจสอบลิงก์…</p>}
      {done ? <section className={panel}><p role="status" className="font-semibold text-emerald-800">บันทึกผลการอนุมัติแล้ว</p></section>
        : data?.stage === "invalid" ? <section className={panel}>ลิงก์ไม่ถูกต้อง หมดอายุ หรือดำเนินการแล้ว กรุณาเปิดจากอีเมลคำขอล่าสุด</section>
        : data?.stage === "otp" ? <section className={panel + " max-w-xl space-y-4"}>
          <p className="text-sm text-zinc-600">ขอรหัสยืนยันจากอีเมลผู้อนุมัติที่ลงทะเบียนไว้ รหัสมีอายุ 5 นาที</p>
          <button className={button} disabled={busy} onClick={() => action("request")}>{sent ? "ขอรหัสใหม่" : "ส่งรหัส OTP"}</button>
          {sent && <p className="text-sm text-emerald-800" role="status">ส่งรหัสแล้ว กรุณาตรวจสอบกล่องจดหมาย</p>}
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); action("verify", { code }); }}>
            <Field label="รหัส OTP"><input className={input} required inputMode="numeric" autoComplete="one-time-code"
              maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value)} /></Field>
            <button className={primary} disabled={busy}>ยืนยันและเปิดเอกสาร</button>
          </form>
        </section> : doc && <>
          {doc.payment && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            ขออนุมัติยอดเพิ่มเติม ฿{money(doc.payment.difference)} จากยอดที่อนุมัติเดิม ฿{money(doc.payment.previous_approved_total)}
          </p>}
          <DocumentView data={doc} fileUrl={fileHref} />
          {doc.senderMessage && <section className={panel}>
            <h2 className="font-semibold">ข้อความเพิ่มเติมถึงผู้บริหาร</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{doc.senderMessage}</p>
          </section>}
          {(doc.files.length > 0 || doc.receipt) && <section className={panel}>
            <h2 className="text-lg font-semibold">ไฟล์แนบ</h2>
            <FileList files={[...doc.files, ...(doc.receipt ? [doc.receipt] : [])]} href={fileHref} />
          </section>}
          <section className={panel + " space-y-3"}>
            <h2 className="text-lg font-semibold">บันทึกผลการอนุมัติ</h2>
            <Field label="ความคิดเห็น"><textarea className={input} value={comment} maxLength={2000} rows={3}
              onChange={(event) => setComment(event.target.value)} /></Field>
            <div className="flex flex-wrap gap-2">
              {decisions.map(([value, label, className]) =>
                <button className={className} key={value} disabled={busy} onClick={() => decision(value, label)}>{label}</button>)}
            </div>
          </section>
        </>}
    </div>
  </main>;
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { stages } from "@/lib/purchase/data";
import { button, ErrorBox, Field, Heading, input, panel, post, primary, usePurchaseData } from "./ui";

function ApproverForm({ api, row, refresh, title }) {
  const [form, setForm] = useState(() => ({ name: "", position: "", email: "", level: 1, active: true, ...row }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  async function save(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await post(api, form);
      if (!row) setForm({ name: "", position: "", email: "", level: 1, active: true });
      setMessage("บันทึกแล้ว");
      refresh();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <form className={panel + " space-y-3"} onSubmit={save}>
    <h2 className="font-semibold">{title}</h2>
    <ErrorBox message={error} />
    {message && <p className="text-sm text-emerald-800" role="status">{message}</p>}
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["name", "ชื่อผู้อนุมัติ", "text", 160], ["position", "ตำแหน่ง", "text", 160], ["email", "อีเมล", "email", 254]]
        .map(([key, label, type, length]) => <Field key={key} label={label}>
          <input type={type} maxLength={length} required className={input} value={form[key]} onChange={(event) => change(key, event.target.value)} />
        </Field>)}
      <Field label="ระดับการอนุมัติ"><input type="number" min="1" max="20" required className={input} value={form.level}
        onChange={(event) => change("level", event.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active}
        onChange={(event) => change("active", event.target.checked)} /> เปิดใช้งาน</label>
      <div><button className={row ? button : primary}>บันทึกผู้อนุมัติ</button></div>
    </fieldset>
  </form>;
}

export default function PurchaseApprovers({ brand }) {
  const api = `/api/purchase/${brand}/approvers`;
  const { data, error, refresh } = usePurchaseData(api);
  return <div className="space-y-5">
    <Heading title="ตั้งค่าผู้อนุมัติ" subtitle={brand.toUpperCase()}>
      <Link className={button} href={`/${brand}/purchase`}>กลับหน้ารายการ</Link>
    </Heading>
    <ErrorBox message={error} />
    {!data && !error && <p role="status">กำลังโหลด…</p>}
    {data && <>
      <p className="text-sm text-zinc-600">ตั้งผู้อนุมัติที่เปิดใช้งานหนึ่งคนต่อระดับ ใช้อีเมลแยกกัน เริ่มจากระดับ 1 {stages[1]} และระดับ 2 {stages[2]} เพิ่มระดับต่อเนื่องได้ตามต้องการ</p>
      {data.approvers.map((row) => <ApproverForm key={row.id} api={api} row={row} refresh={refresh}
        title={`ระดับ ${row.level} · ${row.name}${row.active ? "" : " (ปิดใช้งาน)"}`} />)}
      <ApproverForm api={api} refresh={refresh} title="เพิ่มผู้อนุมัติ" />
    </>}
  </div>;
}

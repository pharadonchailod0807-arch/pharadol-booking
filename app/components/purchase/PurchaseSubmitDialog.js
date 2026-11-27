"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/purchase/data";
import { ApproverSettingsLink, button, ErrorBox, Field, input, primary, usePurchaseData } from "./ui";

const newApprover = "new";
const initial = { name: "", position: "", email: "", remember: false };

export default function PurchaseSubmitDialog({ url, settings, doc, busy, issue, onClose, onSubmit }) {
  const dialog = useRef(null);
  const { data, error } = usePurchaseData(url + "/approval-route");
  const [choices, setChoices] = useState({});
  const [newLevel, setNewLevel] = useState(null);
  const [approver, setApprover] = useState(initial);
  const [message, setMessage] = useState("");
  const byLevel = new Map();
  for (const candidate of data?.candidates || []) {
    if (!byLevel.has(candidate.level)) byLevel.set(candidate.level, []);
    byLevel.get(candidate.level).push(candidate);
  }
  const levelCount = Math.max(1, ...byLevel.keys());
  const levels = Array.from({ length: levelCount }, (_, index) => index + 1);
  const inlineLevel = settings ? newLevel ?? (data && !byLevel.size ? 1 : null) : null;
  const selected = levels.map((level) => {
    if (level === inlineLevel) return null;
    const candidates = byLevel.get(level) || [];
    return candidates.length === 1 ? candidates[0] : candidates.find((candidate) => candidate.id === choices[level]);
  });
  const recipients = selected.filter(Boolean).map((candidate) => candidate.email.toLowerCase());
  if (inlineLevel && approver.email.trim()) recipients.push(approver.email.trim().toLowerCase());
  const duplicate = new Set(recipients).size !== recipients.length;
  const missingLevel = levels.some((level) => !byLevel.has(level) && level !== inlineLevel);
  const complete = !missingLevel && selected.every((candidate, index) => candidate || index + 1 === inlineLevel);
  const fieldsReady = !inlineLevel || [approver.name, approver.position, approver.email].every((field) => field.trim());
  const current = data?.version === doc.version;
  const canSubmit = current && complete && fieldsReady && !duplicate && !busy;
  const setField = (key, value) => setApprover((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  function select(level, value) {
    if (value === newApprover) setNewLevel(level);
    else {
      if (inlineLevel === level) setNewLevel(null);
      setChoices((previous) => ({ ...previous, [level]: value }));
    }
  }

  return <dialog ref={dialog} aria-labelledby="purchase-submit-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl backdrop:bg-black/50 sm:p-6">
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      if (!canSubmit) return;
      onSubmit({
        approval_route: selected.map((candidate) => candidate ? { id: candidate.id, updated_at: candidate.updated_at } : null),
        sender_message: message,
        ...(inlineLevel && { inline_approver: { ...approver, level: inlineLevel } }),
      });
    }}>
      <h2 id="purchase-submit-title" className="text-xl font-bold">ตรวจสอบก่อนส่งขออนุมัติ</h2>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3 text-sm">
        <div><dt>เลขที่เอกสาร</dt><dd className="break-words font-semibold">{doc.number}</dd></div>
        <div><dt>ยอดขออนุมัติ</dt><dd className="font-semibold">฿{money(doc.total)}</dd></div>
        {data && <div><dt>จำนวนระดับการอนุมัติ</dt><dd className="font-semibold">{levelCount} ระดับ</dd></div>}
      </dl>
      <ErrorBox message={error || issue || (data && !current ? "เอกสารถูกอัปเดต กรุณาปิดหน้าต่างนี้แล้วโหลดหน้าใหม่" : "")} />
      {!data && !error && <p role="status">กำลังโหลดรายชื่อผู้อนุมัติ…</p>}
      {data && <>
        {missingLevel && <div className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          <p>{byLevel.size ? "กำหนดผู้อนุมัติให้ครบทุกระดับตามลำดับก่อนส่ง" : "ยังไม่มีผู้อนุมัติระดับ 1 สำหรับแบรนด์นี้"}</p>
          {settings ? <ApproverSettingsLink href={settings} /> : <p>ติดต่อผู้ดูแลแบรนด์เพื่อเปิดใช้งานผู้อนุมัติ</p>}
        </div>}
        <ol className="space-y-3" aria-label="ลำดับการอนุมัติ">
          {levels.map((level, index) => {
            const candidates = byLevel.get(level) || [];
            const usingNew = inlineLevel === level;
            return <li key={level} className="space-y-3 rounded-xl border border-zinc-200 p-3">
              <Field label={"ระดับ " + level + " · ผู้อนุมัติ"}>
                <select className={input} required value={usingNew ? newApprover : selected[index]?.id || ""}
                  disabled={busy || (!settings && candidates.length <= 1)}
                  onChange={(event) => select(level, event.target.value)}>
                  <option value="">เลือกผู้อนุมัติ</option>
                  {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.position} · {candidate.email}</option>)}
                  {settings && <option value={newApprover}>เพิ่มผู้อนุมัติใหม่</option>}
                </select>
              </Field>
              {selected[index] && <p className="break-all text-sm text-zinc-600">{selected[index].email}</p>}
              {usingNew && <fieldset disabled={busy} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="ชื่อผู้อนุมัติ"><input className={input} required maxLength={160} value={approver.name}
                    onChange={(event) => setField("name", event.target.value)} /></Field>
                  <Field label="ตำแหน่ง"><input className={input} required maxLength={160} value={approver.position}
                    onChange={(event) => setField("position", event.target.value)} /></Field>
                </div>
                <Field label="อีเมลผู้อนุมัติ"><input className={input} type="email" required maxLength={254} value={approver.email}
                  onChange={(event) => setField("email", event.target.value)} /></Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={approver.remember} onChange={(event) => setField("remember", event.target.checked)} />
                  บันทึกผู้อนุมัติสำหรับครั้งถัดไป
                </label>
              </fieldset>}
            </li>;
          })}
        </ol>
        {duplicate && <ErrorBox message="เลือกผู้อนุมัติที่ใช้อีเมลคนละบัญชีในแต่ละระดับ" />}
        <Field label="ข้อความเพิ่มเติมถึงผู้บริหาร">
          <textarea className={input} rows={3} maxLength={2000} value={message} disabled={busy}
            onChange={(event) => setMessage(event.target.value)} />
        </Field>
      </>}
      <footer className="flex flex-wrap justify-end gap-2">
        <button type="button" className={button} autoFocus disabled={busy} onClick={onClose}>ยกเลิก</button>
        <button className={primary} disabled={!canSubmit}>{busy ? "กำลังบันทึก…" : "ยืนยันส่งขออนุมัติ"}</button>
      </footer>
    </form>
  </dialog>;
}

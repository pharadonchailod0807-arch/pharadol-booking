"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/purchase/data";
import { ApproverSettingsLink, button, ErrorBox, Field, input, primary, usePurchaseData } from "./ui";

export default function PurchaseSubmitDialog({ url, settings, doc, busy, issue, onClose, onSubmit }) {
  const dialog = useRef(null);
  const { data, error } = usePurchaseData(url + "/approval-route");
  const [choices, setChoices] = useState({});
  const [message, setMessage] = useState("");
  const byLevel = new Map();
  for (const candidate of data?.candidates || []) {
    if (!byLevel.has(candidate.level)) byLevel.set(candidate.level, []);
    byLevel.get(candidate.level).push(candidate);
  }
  const groups = [...byLevel];
  const configured = groups.length > 0 && groups.every(([level], index) => level === index + 1);
  const selected = groups.map(([level, candidates]) =>
    candidates.length === 1 ? candidates[0] : candidates.find((candidate) => candidate.id === choices[level]));
  const duplicate = new Set(selected.filter(Boolean).map((candidate) => candidate.email.toLowerCase())).size !==
    selected.filter(Boolean).length;
  const current = data?.version === doc.version;

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return <dialog ref={dialog} aria-labelledby="purchase-submit-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl backdrop:bg-black/50 sm:p-6">
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      if (busy || !current || !configured || duplicate || selected.some((candidate) => !candidate)) return;
      onSubmit({
        approval_route: selected.map(({ id, updated_at }) => ({ id, updated_at })),
        sender_message: message,
      });
    }}>
      <h2 id="purchase-submit-title" className="text-xl font-bold">ตรวจสอบก่อนส่งขออนุมัติ</h2>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3 text-sm">
        <div><dt>เลขที่เอกสาร</dt><dd className="break-words font-semibold">{doc.number}</dd></div>
        <div><dt>ยอดขออนุมัติ</dt><dd className="font-semibold">฿{money(doc.total)}</dd></div>
        {data && <div><dt>จำนวนระดับการอนุมัติ</dt><dd className="font-semibold">{groups.length} ระดับ</dd></div>}
      </dl>
      <ErrorBox message={error || issue || (data && !current ? "เอกสารถูกอัปเดต กรุณาปิดหน้าต่างนี้แล้วโหลดหน้าใหม่" : "")} />
      {!data && !error && <p role="status">กำลังโหลดรายชื่อผู้อนุมัติ…</p>}
      {data && !configured && <div className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
        <p>{groups.length ? "เปิดใช้งานผู้อนุมัติให้ครบทุกระดับต่อเนื่องตั้งแต่ระดับ 1 ก่อนส่ง" : "ยังไม่มีผู้อนุมัติ กรุณาตั้งผู้อนุมัติระดับ 1 ก่อนส่งใบตั้งเบิก"}</p>
        {settings ? <ApproverSettingsLink href={settings} /> : <p>ติดต่อผู้ดูแลแบรนด์เพื่อเปิดใช้งานผู้อนุมัติ</p>}
      </div>}
      {configured && <>
        <ol className="space-y-3" aria-label="ลำดับการอนุมัติ">
          {groups.map(([level, candidates], index) => <li key={level} className="rounded-xl border border-zinc-200 p-3">
            <Field label={"ระดับ " + level + " · ผู้อนุมัติ"}>
              <select className={input} required value={selected[index]?.id || ""} disabled={busy || candidates.length === 1}
                onChange={(event) => setChoices((previous) => ({ ...previous, [level]: event.target.value }))}>
                <option value="">เลือกผู้อนุมัติ</option>
                {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.position} · {candidate.email}</option>)}
              </select>
            </Field>
            {selected[index] && <p className="mt-1 break-all text-sm text-zinc-600">{selected[index].email}</p>}
          </li>)}
        </ol>
        {duplicate && <ErrorBox message="เลือกผู้อนุมัติที่ใช้อีเมลคนละบัญชีในแต่ละระดับ" />}
        <Field label="ข้อความเพิ่มเติมถึงผู้บริหาร">
          <textarea className={input} rows={3} maxLength={2000} value={message} disabled={busy}
            onChange={(event) => setMessage(event.target.value)} />
        </Field>
      </>}
      <footer className="flex flex-wrap justify-end gap-2">
        <button type="button" className={button} autoFocus disabled={busy} onClick={onClose}>ยกเลิก</button>
        <button className={primary} disabled={busy || !current || !configured || duplicate || selected.some((candidate) => !candidate)}>
          {busy ? "กำลังบันทึก…" : "ยืนยันส่งขออนุมัติ"}
        </button>
      </footer>
    </form>
  </dialog>;
}

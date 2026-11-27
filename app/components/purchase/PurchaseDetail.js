"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { selectDocument } from "@/lib/purchase/document";
import { emailFailureLabel, emailStatuses, statuses, thaiDate } from "@/lib/purchase/data";
import { ApproverSettingsLink, approve, button, danger, DocumentView, ErrorBox, FileList, Heading, panel, post, primary, Status, usePurchaseData } from "./ui";
import PurchaseInventory from "./PurchaseInventory";
import PurchasePayment from "./PurchasePayment";
import PurchaseSubmitDialog from "./PurchaseSubmitDialog";

const actions = {
  created: "สร้างเอกสาร", edited: "แก้ไขเอกสาร", submit: "ส่งขออนุมัติ", revise: "เปิดฉบับแก้ไข",
  cancel: "ยกเลิกเอกสาร", start: "เริ่มจัดซื้อ", payment: "บันทึกข้อมูลการจ่าย", renew: "ต่ออายุลิงก์อนุมัติ",
  file_add: "เพิ่มไฟล์แนบ", file_remove: "นำไฟล์แนบออก", otp_requested: "ขอรหัส OTP",
  otp_failed: "ยืนยัน OTP ไม่สำเร็จ", otp_verified: "ยืนยัน OTP สำเร็จ", equipment_linked: "เชื่อมกับคลังอุปกรณ์",
};

const confirmations = {
  revise: "เปิดฉบับแก้ไขและเริ่มการอนุมัติใหม่เมื่อส่งอีกครั้งหรือไม่?",
  cancel: "ยืนยันยกเลิกเอกสาร? เลขเอกสารและประวัติจะถูกเก็บไว้",
  renew: "ยืนยันสร้างลิงก์ใหม่สำหรับผู้อนุมัติปัจจุบันหรือไม่?",
  file_remove: "ยืนยันนำไฟล์แนบออกหรือไม่?",
};

function deliveryLabel(status, failure) {
  return [emailStatuses[status] || "ตรวจสถานะอีเมลจากประวัติการส่ง",
    status === "failed" && emailFailureLabel(failure)].filter(Boolean).join(" · ");
}

function EmailLog({ data, busy, retry }) {
  if (!data.mail.length) return null;
  return <section className={panel + " space-y-3"}>
    <h2 className="text-lg font-semibold">ประวัติการส่งอีเมลและการอนุมัติ</h2>
    <ul className="divide-y divide-zinc-100">
      {data.mail.map((job) => {
        const step = data.steps.find((entry) => entry.id === job.step_id);
        return <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div className="min-w-0 space-y-1">
            <p>{job.kind === "invite" ? "คำขออนุมัติ" : "แจ้งผลผู้เสนอ"} · รอบ {step?.round} ระดับ {step?.level}</p>
            <p className="break-all font-medium">{job.kind === "invite" ? step?.name : data.document.proposer} · {job.recipient}</p>
            <p className={job.status === "failed" ? "text-red-800" : "text-zinc-600"}>
              {deliveryLabel(job.status, job.failure)}
              {job.sent_at ? ` · ส่งเมื่อ ${thaiDate(job.sent_at, true)}` : job.first_attempt_at ? ` · เริ่มส่ง ${thaiDate(job.first_attempt_at, true)}` : ""}
            </p>
            {step && <p className="text-zinc-600">สถานะอนุมัติ <Status value={step.status} />{step.acted_at ? ` · ${thaiDate(step.acted_at, true)}` : ""}</p>}
            {step?.comment && <p className="whitespace-pre-wrap break-words">ความคิดเห็นผู้อนุมัติ {step.comment}</p>}
          </div>
          {data.access.write && ["failed", "pending", "sending"].includes(job.status) &&
            <button className={button} disabled={busy} onClick={() => retry(job.id)}>ลองส่งอีกครั้ง</button>}
        </li>;
      })}
    </ul>
  </section>;
}

function History({ data, href }) {
  if (!data.audit.length && !data.rounds.length) return null;
  return <section className={panel + " space-y-3"}>
    <h2 className="text-lg font-semibold">ประวัติเอกสาร</h2>
    {data.rounds.length > 0 && <div className="flex flex-wrap gap-2">
      {data.rounds.map((round) => <Link key={round.round} className={button} href={`${href}/round/${round.round}`}>
        รอบ {round.round} · {round.kind === "overage" ? "ยอดเพิ่มเติม" : "ใบตั้งเบิก"}
      </Link>)}
    </div>}
    <ul className="max-h-72 divide-y divide-zinc-100 overflow-auto" aria-label="ลำดับเหตุการณ์">
      {data.audit.map((entry) => <li key={entry.id} className="py-2 text-sm">
        <p className="break-words">{actions[entry.action] || statuses[entry.action] || entry.action}
          {entry.detail.equipment_code ? ` · ${entry.detail.equipment_code}` : ""}</p>
        <p className="break-words text-zinc-600">{thaiDate(entry.created_at, true)} · {entry.actor}</p>
        {entry.detail.comment && <p className="whitespace-pre-wrap break-words">{entry.detail.comment}</p>}
      </li>)}
    </ul>
  </section>;
}

export default function PurchaseDetail({ brand, requisitionId, round }) {
  const router = useRouter();
  const root = `/${brand}/purchase`;
  const href = `${root}/${requisitionId}`;
  const api = `/api/purchase/${brand}`;
  const url = `${api}/${requisitionId}`;
  const { data, error, refresh } = usePurchaseData(url + (round ? "?round=" + round : ""));
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState("");
  const [notice, setNotice] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [inventory, showInventory] = useState(false);
  const tracking = !round && (["pending", "overage_pending"].includes(data?.document.status) ||
    data?.mail.some((job) => ["pending", "sending"].includes(job.status)));
  useEffect(() => {
    if (!tracking) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh, tracking]);
  if (error) return <><Link className={button} href={root}>กลับหน้ารายการ</Link><ErrorBox message={error} /></>;
  if (!data) return <p role="status">กำลังโหลดเอกสาร…</p>;

  const { document: doc, access } = data;
  const settings = access.manage ? root + "/approvers" : null;
  const view = selectDocument(data, Boolean(round));
  const editable = ["draft", "returned"].includes(doc.status);
  const step = data.steps.find((entry) => entry.round === doc.round && entry.status === "pending");
  const expired = step && Date.parse(step.invite_expires_at) <= Date.parse(data.serverTime);
  const fileHref = (file) => `${url}/files/${file.id}`;
  const receipt = view.payment?.receipt_id ? data.receipts.find((file) => file.id === view.payment.receipt_id) : null;
  const files = round ? [...view.files, ...(receipt ? [receipt] : [])] : [...view.files, ...data.receipts];

  async function act(action, values = {}) {
    if (confirmations[action] && !window.confirm(confirmations[action])) return;
    setBusy(true);
    setIssues("");
    setNotice("");
    try {
      const response = await post(`${url}/${action}`, { version: doc.version, ...values });
      if (action === "submit") {
        setSubmitOpen(false);
        setNotice("บันทึกรอบอนุมัติแล้ว · " + deliveryLabel(response.delivery, response.failure));
      }
      if (action === "retry") setNotice(deliveryLabel(response.delivery, response.failure));
      if (action === "revise") router.push(href + "/edit");
      else refresh();
    } catch (error) {
      setIssues(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-5xl space-y-5">
    <Heading title={round ? `รอบอนุมัติ ${round}` : doc.number} subtitle={brand.toUpperCase()}>
      <Link className={button} href={round ? href : root}>{round ? "กลับเอกสารปัจจุบัน" : "กลับหน้ารายการ"}</Link>
      {!round && settings && <ApproverSettingsLink href={settings} />}
      {!round && access.write && editable && <Link className={button} href={href + "/edit"}>แก้ไข</Link>}
      {!round && access.write && editable && <button className={primary} disabled={busy} onClick={() => { setIssues(""); setSubmitOpen(true); }}>ส่งขออนุมัติ</button>}
      <a className={button} href={url + "/pdf" + (round ? "?round=" + round : "")}>ดาวน์โหลด PDF</a>
    </Heading>
    {!submitOpen && <ErrorBox message={issues} />}
    {notice && <p role="status" className="rounded-xl bg-zinc-50 p-3 text-sm">{notice}</p>}
    {submitOpen && <PurchaseSubmitDialog url={url} settings={settings} doc={doc} busy={busy} issue={issues}
      onClose={() => { setIssues(""); setSubmitOpen(false); }} onSubmit={(values) => act("submit", values)} />}
    <div className="flex flex-wrap items-center gap-2">
      <Status value={view.document.status} />
      {!round && doc.current_approver && <span className="text-sm text-zinc-600">ระดับ {doc.current_level} · {doc.current_approver}</span>}
      {!round && access.write && expired && <button className={button} disabled={busy} onClick={() => act("renew")}>ส่งลิงก์ใหม่</button>}
      {!round && access.write && doc.status === "approved" &&
        <button className={button} disabled={busy} onClick={() => act("revise")}>เปิดฉบับแก้ไข</button>}
      {!round && access.finance && doc.status === "approved" &&
        <button className={approve} disabled={busy} onClick={() => act("start")}>เริ่มจัดซื้อ</button>}
      {!round && access.write && ["draft", "returned", "pending", "rejected"].includes(doc.status) &&
        <button className={danger} disabled={busy} onClick={() => act("cancel")}>ยกเลิกเอกสาร</button>}
      {!round && access.inventory && doc.status === "completed" &&
        <button className={primary} onClick={() => showInventory(!inventory)} aria-expanded={inventory}>เพิ่มเข้าคลังอุปกรณ์</button>}
    </div>
    <DocumentView data={view} fileUrl={(file) => fileHref(file) + "?inline=1"} />
    {files.length > 0 && <section className={panel + " space-y-2"}>
      <h2 className="text-lg font-semibold">ไฟล์แนบ</h2>
      <FileList files={files} href={fileHref} busy={busy} />
      {!round && editable && access.write && view.files.length > 0 && <details className="text-sm">
        <summary className="cursor-pointer">จัดการไฟล์แนบ</summary>
        <FileList files={view.files} href={fileHref} onRemove={(file) => act("file_remove", { id: file.id })} busy={busy} />
      </details>}
    </section>}
    {!round && inventory && access.inventory && doc.status === "completed" && <PurchaseInventory api={url + "/inventory"} items={data.items} />}
    {!round && access.finance && doc.status === "purchasing" &&
      <PurchasePayment api={api} doc={doc} receipts={data.receipts} refresh={refresh} />}
    {!round && <>
      <EmailLog data={data} busy={busy} retry={(id) => act("retry", { id })} />
      <History data={data} href={href} />
    </>}
  </div>;
}

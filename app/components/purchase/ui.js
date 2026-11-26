"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "../../../public/purchase/document.css";
import { documentHtml } from "@/lib/purchase/document";
import { fileLimit, fileTypes, statuses } from "@/lib/purchase/data";

export const panel = "min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6";
export const button = "inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-center text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50";
export const primary = button + " !border-zinc-900 !bg-zinc-900 !text-white hover:!bg-zinc-700";
export const approve = button + " !border-emerald-700 !bg-emerald-700 !text-white hover:!bg-emerald-800";
export const danger = button + " !border-red-200 !bg-red-50 !text-red-800 hover:!bg-red-100";
export const input = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-100";

export function ApproverSettingsLink({ href }) {
  return <Link className={button + " gap-2"} href={href}>
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="m9 3-.8 2.5-2.4 1-2.4-.7L2 9l1.9 1.8v2.4L2 15l1.4 3.2 2.4-.7 2.4 1L9 21h6l.8-2.5 2.4-1 2.4.7L22 15l-1.9-1.8v-2.4L22 9l-1.4-3.2-2.4.7-2.4-1L15 3z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
    ตั้งค่าผู้อนุมัติ
  </Link>;
}

export function Status({ value }) {
  const tone = ["pending", "overage_pending", "queued", "purchasing"].includes(value) ? "bg-amber-50 text-amber-900 ring-amber-200"
    : ["approved", "completed", "accepted"].includes(value) ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
      : ["rejected", "cancelled"].includes(value) ? "bg-red-50 text-red-900 ring-red-200"
        : "bg-zinc-100 text-zinc-700 ring-zinc-200";
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}>{statuses[value] || value}</span>;
}

export function Heading({ title, subtitle, children }) {
  return <header className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </header>;
}

export function ErrorBox({ message }) {
  return message ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{message}</p> : null;
}

export function Field({ label, children }) {
  return <label className="block min-w-0 text-sm font-medium text-zinc-800"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

export function DateField({ value, onChange, label, required = false }) {
  return <Field label={label}>
    <input className={input} value={value || ""} onChange={(event) => onChange(event.target.value)}
      placeholder="วัน/เดือน/ปี" maxLength={10} required={required} />
  </Field>;
}

export async function request(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "ไม่สามารถทำรายการได้ กรุณาลองใหม่");
  return data;
}

export const post = (url, data) => request(url, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
});

export function usePurchaseData(url) {
  const [state, setState] = useState({ url: null, data: null, error: "" });
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((value) => value + 1), []);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    request(url, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ url, data, error: "" }); },
      (error) => { if (!controller.signal.aborted) setState({ url, data: null, error: error.message }); },
    );
    return () => controller.abort();
  }, [url, generation]);
  return { ...(state.url === url ? state : { data: null, error: "" }), refresh };
}

export async function uploadFile(api, requisitionId, file, kind, version, item) {
  if (file.size === 0 || file.size > fileLimit) throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 3 MB");
  const params = new URLSearchParams({ kind, version: String(version), name: file.name, ...(item ? { item } : {}) });
  return request(`${api}/${requisitionId}/files?${params}`, {
    method: "POST", headers: { "Content-Type": file.type }, body: file,
  });
}

export function DocumentView({ data, fileUrl }) {
  return <div className={panel}>
    <div dangerouslySetInnerHTML={{ __html: documentHtml(data, { image: fileUrl }) }} />
  </div>;
}

export function FileList({ files, href, onRemove, busy }) {
  if (!files.length) return null;
  return <ul className="divide-y divide-zinc-100">
    {files.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{fileTypes[file.kind]}</p>
        <a className="break-all font-medium underline underline-offset-2" href={href(file)}>{file.name}</a>
      </div>
      {onRemove && <button type="button" className={danger} disabled={busy} onClick={() => onRemove(file)}>นำออก</button>}
    </li>)}
  </ul>;
}

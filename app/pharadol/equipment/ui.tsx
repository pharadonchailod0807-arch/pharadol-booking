"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";
import type { Equipment, EquipmentStatus } from "@/lib/equipment/types";
export const statusLabels: Record<string, string> = {
  available: "พร้อมใช้งาน",
  in_use: "กำลังใช้งาน",
  maintenance: "อยู่ระหว่างซ่อม",
  damaged: "ชำรุด",
  retired: "ปลดระวาง",
  pending: "รอดำเนินการ",
  in_progress: "กำลังซ่อม",
  completed: "ซ่อมเสร็จ / ยืนยันแล้ว",
  cancelled: "ยกเลิก",
};
export const money = (v: unknown) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
export const dateText = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  const body = await r
    .json()
    .catch(() => ({ error: "การเชื่อมต่อขัดข้อง กรุณาลองใหม่" }));
  if (!r.ok || body.success === false)
    throw new Error(body.error || "ไม่สามารถทำรายการได้");
  return body;
}
export const inputClass =
  "w-full rounded-xl border border-[#DDE5DC] bg-white px-3 py-2.5 text-sm text-[#10231C] outline-none focus:border-[#183024] focus:ring-2 focus:ring-[#183024]/10 disabled:bg-gray-100";
export function Button({
  children,
  onClick,
  type = "button",
  disabled = false,
  primary = false,
  danger = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183024] ${primary ? "border-black bg-black text-white hover:bg-gray-800" : danger ? "border-red-200 bg-white text-red-700 hover:bg-red-50" : "border-[#DDE5DC] bg-white text-[#10231C] hover:bg-[#F6F7F3]"} ${className}`}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid content-start gap-1.5 text-xs font-medium text-[#66756D]">
      {label}
      <input {...props} className={inputClass} />
    </label>
  );
}
export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid content-start gap-1.5 text-xs font-medium text-[#66756D]">
      {label}
      <select {...props} className={inputClass}>
        {children}
      </select>
    </label>
  );
}
export function Notes({
  label = "หมายเหตุ",
  name = "notes",
  value = "",
}: {
  label?: string;
  name?: string;
  value?: string;
}) {
  return (
    <label className="col-span-full grid gap-1.5 text-xs font-medium text-[#66756D]">
      {label}
      <textarea
        name={name}
        defaultValue={value}
        maxLength={4000}
        rows={3}
        className={inputClass}
      />
    </label>
  );
}
export function Status({ status }: { status: string }) {
  const cls =
    (
      {
        available: "bg-green-50 text-green-800",
        in_use: "bg-blue-50 text-blue-800",
        maintenance: "bg-amber-50 text-amber-800",
        damaged: "bg-red-50 text-red-700",
        retired: "bg-gray-100 text-gray-600",
      } as Record<string, string>
    )[status] || "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      {statusLabels[status] || status}
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-44 place-content-center gap-2 px-6 py-10 text-center">
      <div className="mx-auto mb-1 text-3xl text-[#A4B0A7]" aria-hidden="true">
        ▣
      </div>
      <p className="text-sm text-[#66756D]">{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    headingId = "equipment-" + title.replace(/\s/g, "-");
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className={`m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[#DDE5DC] bg-white p-0 text-[#10231C] shadow-2xl backdrop:bg-black/40 ${wide ? "lg:max-w-5xl" : ""}`}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#DDE5DC] bg-white px-5 py-4">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="ปิดหน้าต่าง"
          className="grid h-11 w-11 place-items-center rounded-xl border border-[#DDE5DC] text-xl disabled:opacity-40"
        >
          ×
        </button>
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </dialog>
  );
}
export function Pager({
  page,
  total,
  onChange,
  size = 20,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  size?: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DDE5DC] px-4 py-4 text-xs text-[#66756D]">
      <span>
        {total.toLocaleString()} รายการ · หน้า {page} /{" "}
        {Math.max(1, Math.ceil(total / size))}
      </span>
      <div className="flex gap-2">
        <Button disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ก่อนหน้า
        </Button>
        <Button
          disabled={page * size >= total}
          onClick={() => onChange(page + 1)}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}
export function EquipmentPicker({
  onSelect,
}: {
  onSelect: (equipment: Equipment) => void;
}) {
  const [search, setSearch] = useState(""),
    [rows, setRows] = useState<Equipment[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void api<{ equipment: Equipment[]; total: number }>(
        `/api/equipment?search=${encodeURIComponent(search)}&page=${page}`,
      )
        .then((r) => {
          if (active) {
            setRows(r.equipment);
            setTotal(r.total);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, page]);
  return (
    <div className="col-span-full rounded-xl border border-[#DDE5DC] p-3">
      <Field
        label="ค้นหาและเลือกอุปกรณ์จากคลัง"
        placeholder="ชื่อ รหัส ยี่ห้อ หรือ Serial Number"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div
        className="mt-3 grid max-h-48 gap-1 overflow-y-auto"
        aria-busy={loading}
      >
        {rows.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onSelect(e)}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F6F7F3]"
          >
            <span>
              {e.name}
              <small className="ml-2 text-[#66756D]">{e.equipment_code}</small>
            </span>
            <span className="whitespace-nowrap text-xs text-[#66756D]">
              ว่าง {e.available} {e.unit} · เลือก +
            </span>
          </button>
        ))}
        {!loading && !rows.length && (
          <p className="py-3 text-sm text-[#66756D]">ไม่พบอุปกรณ์</p>
        )}
      </div>
      <Pager page={page} total={total} onChange={setPage} />
    </div>
  );
}
export const statuses: EquipmentStatus[] = [
  "available",
  "in_use",
  "maintenance",
  "damaged",
  "retired",
];

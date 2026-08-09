"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const ACTION_OPTIONS = [
  "",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "MEMBER_CREATED",
  "MEMBER_UPDATED",
  "MEMBER_DELETED",
  "MEMBER_RESTORED",
  "MEMBER_PERMANENT_DELETED",
  "CUSTOMER_UPDATED",
  "CUSTOMER_DELETED",
  "CUSTOMER_PERMANENT_DELETED",
  "BOOKING_CREATED",
  "BOOKING_UPDATED",
  "BOOKING_DELETED",
  "BANK_ACCOUNT_VIEWED",
  "EMAIL_SENT",
  "SETTINGS_CHANGED",
  "PERMISSION_DENIED",
];

const RESULT_OPTIONS = ["", "success", "failure"];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const safeMetadataText = (metadata) => {
  if (!metadata || typeof metadata !== "object") return "-";
  const entries = Object.entries(metadata).filter(
    ([key]) => !/password|token|cookie|secret|otp|bank/i.test(key)
  );
  if (entries.length === 0) return "-";
  return entries
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join("\n");
};

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({
    brand: "",
    action: "",
    result: "",
    resourceType: "",
    user: "",
    dateFrom: "",
    dateTo: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canGoPrev = page > 0;
  const canGoNext = page + 1 < totalPages;

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    Object.entries(filters).forEach(([key, value]) => {
      const trimmedValue = String(value || "").trim();
      if (trimmedValue) params.set(key, trimmedValue);
    });

    return params.toString();
  }, [filters, page, pageSize]);

  const loadAuditLogs = useCallback(
    async (signal) => {
      setIsLoading(true);
      setError("");

      const response = await fetch(`/api/audit-logs?${queryString}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "โหลด Audit Log ไม่สำเร็จ");
      }

      setLogs(Array.isArray(result.logs) ? result.logs : []);
      setTotal(Number(result.total || 0));
      setIsLoading(false);
    },
    [queryString]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      loadAuditLogs(controller.signal).catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError?.message || "โหลด Audit Log ไม่สำเร็จ");
        setIsLoading(false);
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadAuditLogs]);

  const setFilterValue = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  };

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700">
            Security
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-zinc-950">
            Audit Log
          </h1>
          <p className="mt-1 text-sm font-semibold text-zinc-500">
            ประวัติการใช้งานระบบที่ผ่าน permission ฝั่ง server
          </p>
        </div>
        <a
          href="/admin"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-extrabold text-zinc-700"
        >
          กลับหน้า Admin
        </a>
      </header>

      <section className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-7">
        <select
          value={filters.brand}
          onChange={(event) => setFilterValue("brand", event.target.value)}
          className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"
        >
          <option value="">ทุกแบรนด์</option>
          <option value="pharadol">Pharadol</option>
          <option value="adisorn">Adisorn</option>
        </select>
        <select
          value={filters.action}
          onChange={(event) => setFilterValue("action", event.target.value)}
          className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"
        >
          {ACTION_OPTIONS.map((action) => (
            <option key={action || "all"} value={action}>
              {action || "ทุก Action"}
            </option>
          ))}
        </select>
        <select
          value={filters.result}
          onChange={(event) => setFilterValue("result", event.target.value)}
          className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"
        >
          {RESULT_OPTIONS.map((result) => (
            <option key={result || "all"} value={result}>
              {result || "ทุก Result"}
            </option>
          ))}
        </select>
        <input
          value={filters.resourceType}
          onChange={(event) => setFilterValue("resourceType", event.target.value)}
          placeholder="resource"
          className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"
        />
        <input
          value={filters.user}
          onChange={(event) => setFilterValue("user", event.target.value)}
          placeholder="user"
          className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"
        />
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(event) => setFilterValue("dateFrom", event.target.value)}
          className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(event) => setFilterValue("dateTo", event.target.value)}
          className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-zinc-700">
            {total.toLocaleString("th-TH")} รายการ
          </p>
          <label className="flex items-center gap-2 text-xs font-bold text-zinc-500">
            แสดง
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-black"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            รายการ
          </label>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center text-center text-sm font-bold text-zinc-500">
            ยังไม่มี Audit Log ตามตัวกรองนี้
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-black uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-3">เวลา</th>
                  <th className="px-3 py-3">ผู้ใช้</th>
                  <th className="px-3 py-3">แบรนด์</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Resource</th>
                  <th className="px-3 py-3">Result</th>
                  <th className="px-3 py-3">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="px-3 py-3 font-bold text-zinc-700">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-black text-zinc-900">{log.username || "-"}</p>
                      <p className="text-xs font-bold text-zinc-400">{log.role || "-"}</p>
                    </td>
                    <td className="px-3 py-3 font-bold text-zinc-700">{log.brand || "-"}</td>
                    <td className="px-3 py-3 font-black text-zinc-900">{log.action || "-"}</td>
                    <td className="px-3 py-3">
                      <p className="font-bold text-zinc-700">{log.resourceType || "-"}</p>
                      <p className="text-xs font-bold text-zinc-400">{log.resourceId || "-"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${
                        log.result === "success"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}>
                        {log.result || "-"}
                      </span>
                    </td>
                    <td className="max-w-[320px] whitespace-pre-wrap break-words px-3 py-3 text-xs font-semibold text-zinc-500">
                      {safeMetadataText(log.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-zinc-500">
            หน้า {(page + 1).toLocaleString("th-TH")} จาก {totalPages.toLocaleString("th-TH")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={!canGoPrev}
              className="min-h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 disabled:opacity-45"
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!canGoNext}
              className="min-h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 disabled:opacity-45"
            >
              ถัดไป
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

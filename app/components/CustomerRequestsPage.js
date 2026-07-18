"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CUSTOMER_FORM_LINKS,
  CUSTOMER_REQUEST_STATUSES,
  getCustomerRequestPrefill,
  getPendingBookingPrefillKey,
  loadCustomerRequests,
  readLocalCustomerRequests,
  updateLocalCustomerRequest,
  deleteLocalCustomerRequest,
} from "@/app/lib/customerRequests";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";

const BRAND_NAMES = {
  pharadol: "PHARADOL PRODUCTION",
  adisorn: "Adisorn Wedding Studio",
};

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getStatusClassName = (status) => {
  if (status === "contacted") {
    return "border border-green-200 bg-green-100 text-green-700";
  }

  if (status === "new") {
    return "border border-orange-200 bg-orange-100 text-orange-700";
  }

  if (status === "viewed") {
    return "border border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "converted" || status === "created_booking") {
    return "border border-indigo-200 bg-indigo-50 text-indigo-700";
  }

  return "border border-zinc-200 bg-zinc-100 text-zinc-600";
};

export default function CustomerRequestsPage({ brand }) {
  const router = useRouter();
  const brandChrome = getBrandChromeStyles(brand);
  const isAdisorn = brand === "adisorn";
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingActionIds, setPendingActionIds] = useState([]);
  const formLink = CUSTOMER_FORM_LINKS[brand];

  const newCount = useMemo(
    () => requests.filter((request) => request.status === "new").length,
    [requests]
  );

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const savedUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
        const activeBrand = sessionStorage.getItem("activeBrand");
        const normalizedBrands = Array.isArray(savedUser?.brands)
          ? savedUser.brands.map((item) => (item === "pharadon" ? "pharadol" : item))
          : [];
        const isAdmin = savedUser?.role === "ADMIN";
        const hasBrandAccess = normalizedBrands.includes(brand);
        const accountIsActive = savedUser?.active !== false;
        const lastActivity = Number(sessionStorage.getItem("lastActivity") || Date.now());
        const sessionExpired = Date.now() - lastActivity > SESSION_TIMEOUT_MS;

        if (
          !loggedIn ||
          !savedUser ||
          !accountIsActive ||
          activeBrand !== brand ||
          (!isAdmin && !hasBrandAccess) ||
          sessionExpired
        ) {
          sessionStorage.clear();
          window.location.replace("/login");
          return false;
        }

        sessionStorage.setItem("lastActivity", String(Date.now()));
        setIsAuthorized(true);
        return true;
      } catch (authError) {
        console.error("Cannot verify customer request access", authError);
        sessionStorage.clear();
        window.location.replace("/login");
        return false;
      }
    };

    verifyAccess();
  }, [brand]);

  useEffect(() => {
    if (!isAuthorized) return;

    const controller = new AbortController();
    const load = async ({ forceRemote = false } = {}) => {
      setIsLoading(true);
      setRequests(readLocalCustomerRequests(brand));
      const result = await loadCustomerRequests(brand, {
        forceRemote,
        signal: controller.signal,
      });
      setRequests(result.requests);
      setError(result.error ? result.error.message : "");
      setIsLoading(false);
    };

    load();

    return () => {
      controller.abort();
    };
  }, [brand, isAuthorized]);

  const refreshRequests = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      const result = await loadCustomerRequests(brand, { forceRemote: true });
      setRequests(result.requests);
      setError(result.error ? result.error.message : "");
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(formLink);
      } else {
        const input = document.createElement("input");
        input.value = formLink;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      setMessage("คัดลอกลิงก์แล้ว");
      window.setTimeout(() => setMessage(""), 1800);
    } catch {
      setError("คัดลอกลิงก์ไม่สำเร็จ กรุณาคัดลอกจากช่องลิงก์โดยตรง");
    }
  };

  const updateRequestStatus = async (request, status, bookingId = "") => {
    const actionKey = `${request.id}:status`;
    if (pendingActionIds.includes(actionKey)) return false;

    setPendingActionIds((current) => [...current, actionKey]);
    setRequests((current) =>
      current.map((item) =>
        item.id === request.id ? { ...item, status, bookingId: bookingId || item.bookingId } : item
      )
    );

    try {
      updateLocalCustomerRequest(brand, request.id, { status, bookingId });

      const response = await fetch("/api/customer-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, brand, status, bookingId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        setError(result.error || "อัปเดตสถานะไม่สำเร็จ");
        return false;
      }

      return true;
    } finally {
      setPendingActionIds((current) =>
        current.filter((item) => item !== actionKey)
      );
    }
  };

  const openAsBooking = async (request) => {
    const actionKey = `${request.id}:open`;
    if (pendingActionIds.includes(actionKey)) return;

    setPendingActionIds((current) => [...current, actionKey]);
    localStorage.setItem(
      getPendingBookingPrefillKey(brand),
      JSON.stringify(getCustomerRequestPrefill(request))
    );
    try {
      await updateRequestStatus(request, "viewed");
      router.push(`/${brand}`);
    } finally {
      setPendingActionIds((current) =>
        current.filter((item) => item !== actionKey)
      );
    }
  };

  const markContacted = async (request) => {
    const updated = await updateRequestStatus(request, "contacted");
    if (updated) {
      setMessage("ทำเครื่องหมายว่าติดต่อแล้ว");
      window.setTimeout(() => setMessage(""), 1800);
    }
  };

  const deleteRequest = async (request) => {
    if (!window.confirm("ลบคำขอนี้หรือไม่")) return;

    const actionKey = `${request.id}:delete`;
    if (pendingActionIds.includes(actionKey)) return;

    setPendingActionIds((current) => [...current, actionKey]);
    setRequests((current) => current.filter((item) => item.id !== request.id));

    try {
      deleteLocalCustomerRequest(brand, request.id);

      const response = await fetch(
        `/api/customer-requests?id=${encodeURIComponent(request.id)}&brand=${brand}`,
        { method: "DELETE" }
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        setError(result.error || "ลบคำขอไม่สำเร็จ");
      }
    } finally {
      setPendingActionIds((current) =>
        current.filter((item) => item !== actionKey)
      );
    }
  };

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main
      className="min-h-screen overflow-x-hidden px-4 py-5 text-zinc-950 sm:px-6 lg:px-8"
      style={isAdisorn ? { backgroundColor: brandChrome.theme.background } : undefined}
    >
      <section className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-zinc-400">
              {BRAND_NAMES[brand]}
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">คำขอจากลูกค้า</h1>
            <p className="mt-1 text-sm text-zinc-500">ข้อมูลที่ลูกค้ากรอกผ่านลิงก์</p>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/${brand}/dashboard`)}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition"
            style={brandChrome.primaryButton}
          >
            กลับเมนูหลัก
          </button>
        </div>

        <section className="mb-4 rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold">ลิงก์ฟอร์มลูกค้า</p>
              <p className="mt-0.5 break-all text-xs text-zinc-500 sm:text-sm">{formLink}</p>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-white transition"
              style={brandChrome.primaryButton}
            >
              คัดลอกลิงก์
            </button>
          </div>
        </section>

        {(message || error) && (
          <p
            className={`mb-5 rounded-2xl px-4 py-3 text-sm font-semibold ${
              error
                ? "border border-red-200 bg-red-50 text-red-700"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || message}
          </p>
        )}

        <div className="mb-4 flex items-center justify-between rounded-2xl border border-white bg-white px-4 py-2.5 shadow-sm">
          <span className="text-sm font-semibold">คำขอทั้งหมด {requests.length} รายการ</span>
          <div className="flex items-center gap-2">
            {newCount > 0 && (
              <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">
                ใหม่ {newCount > 99 ? "99+" : newCount}
              </span>
            )}
            <button
              type="button"
              onClick={refreshRequests}
              disabled={isRefreshing}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              {isRefreshing ? "กำลังรีเฟรช" : "รีเฟรช"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-[22px] border border-white bg-white p-8 text-center text-zinc-500 shadow-sm">
            กำลังโหลดคำขอ...
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-[22px] border border-white bg-white p-8 text-center text-zinc-500 shadow-sm">
            ยังไม่มีคำขอจากลูกค้า
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {requests.map((request) => {
              const isOpening = pendingActionIds.includes(`${request.id}:open`);
              const isUpdating = pendingActionIds.includes(`${request.id}:status`);
              const isDeleting = pendingActionIds.includes(`${request.id}:delete`);
              const isBusy = isOpening || isUpdating || isDeleting;

              return (
              <article
                key={request.id}
                className={`group overflow-hidden rounded-[26px] border bg-white shadow-[0_16px_45px_rgba(15,23,42,0.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(15,23,42,0.11)] ${
                  isAdisorn
                    ? "border-[#E9DCCB]"
                    : "border-emerald-100"
                }`}
              >
                <div
                  className={`h-1.5 w-full bg-gradient-to-r ${
                    isAdisorn
                      ? "from-[#4A2E22] via-[#7A5139] to-[#C9A46A]"
                      : "from-emerald-950 via-emerald-600 to-amber-400"
                  }`}
                />

                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-black shadow-sm ${
                          isAdisorn
                            ? "bg-[#F3E6CF] text-[#4A2E22]"
                            : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        {request.customerName?.trim()?.charAt(0) || "?"}
                      </div>

                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-extrabold leading-tight text-zinc-950">
                          {request.customerName}
                        </h2>
                        <p className="mt-1 text-xs font-medium text-zinc-400">
                          ส่งข้อมูลเมื่อ {formatDate(request.createdAt)}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${getStatusClassName(
                        request.status
                      )}`}
                    >
                      {CUSTOMER_REQUEST_STATUSES[request.status] ||
                        request.status}
                    </span>
                  </div>

                  <dl
                    className={`mt-5 grid gap-2.5 rounded-[20px] border p-3 sm:grid-cols-2 sm:p-4 ${
                      isAdisorn
                        ? "border-[#EEE4D8] bg-[#FCF9F5]"
                        : "border-emerald-100 bg-emerald-50/40"
                    }`}
                  >
                    <div className="min-w-0 rounded-2xl bg-white px-3.5 py-3 shadow-sm">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        เบอร์โทร
                      </dt>
                      <dd className="mt-1 truncate text-sm font-bold text-zinc-800">
                        {request.phone || "-"}
                      </dd>
                    </div>

                    <div className="min-w-0 rounded-2xl bg-white px-3.5 py-3 shadow-sm">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        อีเมล
                      </dt>
                      <dd className="mt-1 break-all text-sm font-semibold leading-snug text-zinc-700">
                        {request.email || "-"}
                      </dd>
                    </div>

                    <div className="min-w-0 rounded-2xl bg-white px-3.5 py-3 shadow-sm">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        วันงาน
                      </dt>
                      <dd className="mt-1 text-sm font-bold text-zinc-800">
                        {formatDate(request.eventDate)}
                      </dd>
                    </div>

                    <div className="min-w-0 rounded-2xl bg-white px-3.5 py-3 shadow-sm">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        สถานที่จัดงาน
                      </dt>
                      <dd className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-zinc-700">
                        {request.eventLocation || "-"}
                      </dd>
                    </div>

                    <div className="min-w-0 rounded-2xl bg-white px-3.5 py-3 shadow-sm">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        หลักฐานการโอน
                      </dt>
                      <dd
                        className={`mt-1 text-sm font-extrabold ${
                          request.slipUrl
                            ? "text-emerald-600"
                            : "text-zinc-400"
                        }`}
                      >
                        {request.slipUrl ? "แนบสลิปแล้ว" : "ยังไม่มีสลิป"}
                      </dd>
                    </div>

                    <div className="min-w-0 rounded-2xl bg-white px-3.5 py-3 shadow-sm">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        วันที่ส่งข้อมูล
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-zinc-700">
                        {formatDate(request.createdAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 rounded-[18px] border border-zinc-100 bg-zinc-50/80 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                      รายละเอียดเพิ่มเติม
                    </p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                      {request.note || "-"}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => openAsBooking(request)}
                      disabled={isBusy}
                      className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 ${
                        isAdisorn
                          ? "bg-[#4A2E22] hover:bg-[#5A3828]"
                          : "bg-emerald-800 hover:bg-emerald-900"
                      } disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0`}
                    >
                      {isOpening ? "กำลังเปิด..." : "เปิดเป็นใบจอง"}
                    </button>

                    <button
                      type="button"
                      onClick={() => markContacted(request)}
                      disabled={isBusy}
                      className={`min-h-12 rounded-2xl border px-4 py-3 text-sm font-extrabold transition hover:-translate-y-0.5 ${
                        isAdisorn
                          ? "border-[#D9BE96] bg-[#FFF9EF] text-[#6A432D] hover:bg-[#F3E6CF]"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      } disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0`}
                    >
                      {isUpdating ? "กำลังอัปเดต..." : "ทำเครื่องหมายว่าติดต่อแล้ว"}
                    </button>

                    {request.slipUrl && (
                      <a
                        href={request.slipUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-center text-sm font-bold text-zinc-700 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                      >
                        ดูสลิป
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => deleteRequest(request)}
                      disabled={isBusy}
                      className="min-h-12 rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 text-sm font-bold text-red-600 transition hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
                    >
                      {isDeleting ? "กำลังลบ..." : "ลบคำขอ"}
                    </button>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

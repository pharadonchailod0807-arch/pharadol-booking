"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CUSTOMER_FORM_LINKS,
  CUSTOMER_REQUEST_STATUSES,
  getCustomerRequestPrefill,
  getPendingBookingPrefillKey,
  loadCustomerRequests,
  updateLocalCustomerRequest,
  deleteLocalCustomerRequest,
} from "@/app/lib/customerRequests";

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
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
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

    const load = async () => {
      setIsLoading(true);
      const result = await loadCustomerRequests(brand);
      setRequests(result.requests);
      setError(result.error ? result.error.message : "");
      setIsLoading(false);
    };

    load();
    window.addEventListener("focus", load);

    return () => {
      window.removeEventListener("focus", load);
    };
  }, [brand, isAuthorized]);

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
    setRequests((current) =>
      current.map((item) =>
        item.id === request.id ? { ...item, status, bookingId: bookingId || item.bookingId } : item
      )
    );
    updateLocalCustomerRequest(brand, request.id, { status, bookingId });

    const response = await fetch("/api/customer-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: request.id, brand, status, bookingId }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      setError(result.error || "อัปเดตสถานะไม่สำเร็จ");
    }
  };

  const openAsBooking = async (request) => {
    localStorage.setItem(
      getPendingBookingPrefillKey(brand),
      JSON.stringify(getCustomerRequestPrefill(request))
    );
    await updateRequestStatus(request, "viewed");
    router.push(`/${brand}`);
  };

  const markContacted = async (request) => {
    await updateRequestStatus(request, "contacted");
    setMessage("ทำเครื่องหมายว่าติดต่อแล้ว");
    window.setTimeout(() => setMessage(""), 1800);
  };

  const deleteRequest = async (request) => {
    if (!window.confirm("ลบคำขอนี้หรือไม่")) return;

    setRequests((current) => current.filter((item) => item.id !== request.id));
    deleteLocalCustomerRequest(brand, request.id);

    const response = await fetch(
      `/api/customer-requests?id=${encodeURIComponent(request.id)}&brand=${brand}`,
      { method: "DELETE" }
    );
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      setError(result.error || "ลบคำขอไม่สำเร็จ");
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
    <main className="min-h-screen bg-zinc-100 px-4 py-5 text-zinc-950 sm:px-6 lg:px-8">
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
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
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
              className="rounded-xl border border-zinc-200 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
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
          {newCount > 0 && (
            <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">
              ใหม่ {newCount > 99 ? "99+" : newCount}
            </span>
          )}
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
            {requests.map((request) => (
              <article
                key={request.id}
                className="rounded-[18px] border border-white bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold leading-tight">{request.customerName}</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      ส่งเมื่อ {formatDate(request.createdAt)}
                    </p>
                  </div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${getStatusClassName(request.status)}`}>
                    {CUSTOMER_REQUEST_STATUSES[request.status] || request.status}
                  </span>
                </div>

                <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-zinc-400">เบอร์โทร</dt>
                    <dd className="mt-0.5 font-semibold leading-snug">{request.phone || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-400">อีเมล</dt>
                    <dd className="mt-0.5 break-all leading-snug">{request.email || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-400">วันงาน</dt>
                    <dd className="mt-0.5 leading-snug">{formatDate(request.eventDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-400">สถานที่จัดงาน</dt>
                    <dd className="mt-0.5 line-clamp-2 leading-snug">{request.eventLocation || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-400">สถานะสลิป</dt>
                    <dd className="mt-0.5 font-semibold leading-snug">
                      {request.slipUrl ? "มีสลิป" : "ไม่มีสลิป"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-zinc-400">วันที่ส่งข้อมูล</dt>
                    <dd className="mt-0.5 leading-snug">{formatDate(request.createdAt)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold text-zinc-400">รายละเอียดเพิ่มเติม</dt>
                    <dd className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm leading-6">
                      {request.note || "-"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => openAsBooking(request)}
                    className="min-h-10 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    เปิดเป็นใบจอง
                  </button>
                  <button
                    type="button"
                    onClick={() => markContacted(request)}
                    className="min-h-10 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100"
                  >
                    ทำเครื่องหมายว่าติดต่อแล้ว
                  </button>
                  {request.slipUrl && (
                    <a
                      href={request.slipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-10 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                    >
                      ดูสลิป
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteRequest(request)}
                    className="min-h-10 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                  >
                    ลบคำขอ
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

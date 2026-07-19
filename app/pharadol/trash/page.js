"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";
import { deleteBookingGoogleCalendarEvent } from "@/app/lib/googleCalendarClient";

const BRAND_ID = "pharadol";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const normalizeBookingRow = (row) => {
  const bookingData = row?.booking_data || {};

  return {
    ...bookingData,
    supabaseId: row.id,
    brandId: bookingData.brandId || "",
    bookingNumber: bookingData.bookingNumber || row.booking_number || "",
    customerName: bookingData.customerName || row.customer_name || "",
    phone: bookingData.phone || row.phone || "",
    email: bookingData.email || row.email || "",
    service: bookingData.service || row.service || "",
    location: bookingData.location || row.location || "",
    eventDate: bookingData.eventDate || row.event_date || "",
    jobStatus: row.job_status || bookingData.jobStatus || "รอยืนยัน",
    status: row.job_status || bookingData.status || bookingData.jobStatus || "รอยืนยัน",
  };
};

const getBookingData = (booking, updates = {}) => {
  const { supabaseId, ...bookingData } = booking;
  return { ...bookingData, ...updates, brandId: BRAND_ID };
};

export default function TrashPage() {
  const router = useRouter();
  const brandChrome = getBrandChromeStyles(BRAND_ID);
  const TRASH_KEY = "pharadol_trash";
  const MAIL_TRASH_KEY = "pharadol_mail_trash";

  const [trash, setTrash] = useState([]);
  const [mailTrash, setMailTrash] = useState([]);
  const [customerRequestTrash, setCustomerRequestTrash] = useState([]);
  const [customerRequestTrashError, setCustomerRequestTrashError] =
    useState("");
  const [search, setSearch] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);

  const deleteCalendarEventSafely = async (booking) => {
    if (!booking?.googleCalendarEventId) return "";

    try {
      await deleteBookingGoogleCalendarEvent({
        brand: BRAND_ID,
        booking,
      });
      return "";
    } catch (error) {
      console.error("Cannot delete Google Calendar event", error);
      return error?.message || "ลบ Google Calendar Event ไม่สำเร็จ";
    }
  };

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const accountIsActive = currentUser?.active !== false;
        const brandIsCorrect = activeBrand === "pharadol";
        const lastActivity = Number(
          sessionStorage.getItem("lastActivity") || Date.now()
        );
        const sessionExpired = Date.now() - lastActivity > SESSION_TIMEOUT_MS;

        if (
          !loggedIn ||
          !currentUser ||
          !accountIsActive ||
          !brandIsCorrect ||
          sessionExpired
        ) {
          sessionStorage.clear();
          window.location.replace("/login");
          return false;
        }

        sessionStorage.setItem("lastActivity", String(Date.now()));
        setIsAuthorized(true);
        return true;
      } catch (error) {
        console.error("Cannot verify Pharadol trash access", error);
        sessionStorage.clear();
        window.location.replace("/login");
        return false;
      }
    };

    if (!verifyAccess()) return;

    let activityTimer;

    const updateActivity = () => {
      window.clearTimeout(activityTimer);
      activityTimer = window.setTimeout(() => {
        sessionStorage.setItem("lastActivity", String(Date.now()));
      }, 500);
    };

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );

    return () => {
      window.clearInterval(sessionCheck);
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    const loadTrashData = async () => {
      try {
        const { data, error } = await supabase
          .from("bookings")
          .select("*")
          .eq("deleted", true)
          .order("booking_number", { ascending: false });

        if (error) throw error;

        const deletedBookings = (Array.isArray(data) ? data : [])
          .map(normalizeBookingRow)
          .filter((item) => item.brandId === BRAND_ID);

        localStorage.setItem(TRASH_KEY, JSON.stringify(deletedBookings));
        setTrash(deletedBookings);
      } catch (error) {
        console.error("Cannot load trash data", error);
        const savedTrash = JSON.parse(
          localStorage.getItem(TRASH_KEY) || "[]"
        );
        setTrash(Array.isArray(savedTrash) ? savedTrash : []);
      }
    };

    const handleTrashStorage = (event) => {
      if (event.key === TRASH_KEY) {
        loadTrashData();
      }
    };

    const handlePageVisible = () => {
      if (document.visibilityState === "visible") {
        loadTrashData();
      }
    };

    const bookingsChannel = supabase
      .channel(`${BRAND_ID}-trash-bookings`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        loadTrashData
      )
      .subscribe();

    loadTrashData();

    window.addEventListener("focus", loadTrashData);
    window.addEventListener("pageshow", loadTrashData);
    window.addEventListener("storage", handleTrashStorage);
    document.addEventListener("visibilitychange", handlePageVisible);

    return () => {
      window.removeEventListener("focus", loadTrashData);
      window.removeEventListener("pageshow", loadTrashData);
      window.removeEventListener("storage", handleTrashStorage);
      document.removeEventListener("visibilitychange", handlePageVisible);
      supabase.removeChannel(bookingsChannel);
    };
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;

    const loadMailTrashData = () => {
      try {
        const savedMailTrash = JSON.parse(
          localStorage.getItem(MAIL_TRASH_KEY) || "[]"
        );
        setMailTrash(Array.isArray(savedMailTrash) ? savedMailTrash : []);
      } catch {
        setMailTrash([]);
      }
    };

    const handleMailTrashStorage = (event) => {
      if (event.key === MAIL_TRASH_KEY) {
        loadMailTrashData();
      }
    };

    loadMailTrashData();
    window.addEventListener("focus", loadMailTrashData);
    window.addEventListener("pageshow", loadMailTrashData);
    window.addEventListener("storage", handleMailTrashStorage);

    return () => {
      window.removeEventListener("focus", loadMailTrashData);
      window.removeEventListener("pageshow", loadMailTrashData);
      window.removeEventListener("storage", handleMailTrashStorage);
    };
  }, [isAuthorized]);


  const loadCustomerRequestTrash = async () => {
    try {
      setCustomerRequestTrashError("");

      const response = await fetch(
        `/api/customer-requests?brand=${BRAND_ID}&trash=1`,
        {
          cache: "no-store",
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "โหลดคำขอจากลูกค้าในถังขยะไม่สำเร็จ"
        );
      }

      setCustomerRequestTrash(
        Array.isArray(result.requests) ? result.requests : []
      );
    } catch (error) {
      console.error("Cannot load customer request trash", error);
      setCustomerRequestTrashError(
        error?.message || "โหลดคำขอจากลูกค้าในถังขยะไม่สำเร็จ"
      );
    }
  };

  useEffect(() => {
    if (!isAuthorized) return;

    const handleCustomerRequestUpdate = () => {
      loadCustomerRequestTrash();
    };

    const handleCustomerRequestPageVisible = () => {
      if (document.visibilityState === "visible") {
        loadCustomerRequestTrash();
      }
    };

    loadCustomerRequestTrash();

    window.addEventListener("focus", loadCustomerRequestTrash);
    window.addEventListener("pageshow", loadCustomerRequestTrash);
    window.addEventListener(
      "customer-requests-updated",
      handleCustomerRequestUpdate
    );
    document.addEventListener(
      "visibilitychange",
      handleCustomerRequestPageVisible
    );

    return () => {
      window.removeEventListener("focus", loadCustomerRequestTrash);
      window.removeEventListener("pageshow", loadCustomerRequestTrash);
      window.removeEventListener(
        "customer-requests-updated",
        handleCustomerRequestUpdate
      );
      document.removeEventListener(
        "visibilitychange",
        handleCustomerRequestPageVisible
      );
    };
  }, [isAuthorized]);

  const invalidateCustomerRequestCache = () => {
    localStorage.removeItem(`${BRAND_ID}_customer_requests_cache_meta`);
    window.dispatchEvent(new Event("customer-requests-updated"));
  };

  const restoreCustomerRequest = async (item) => {
    if (!item?.id) return;

    try {
      const response = await fetch("/api/customer-requests", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          brand: BRAND_ID,
          action: "restore",
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "กู้คืนคำขอไม่สำเร็จ");
      }

      setCustomerRequestTrash((current) =>
        current.filter((requestItem) => requestItem.id !== item.id)
      );

      invalidateCustomerRequestCache();
      alert("กู้คืนคำขอกลับหน้าคำขอจากลูกค้าแล้ว");
    } catch (error) {
      console.error("Cannot restore customer request", error);
      alert(error?.message || "กู้คืนคำขอไม่สำเร็จ");
    }
  };

  const deleteCustomerRequestForever = async (item) => {
    if (!item?.id) return;

    if (
      !window.confirm(
        `ยืนยันการลบคำขอของ ${item.customerName || "ลูกค้า"} แบบถาวร?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/customer-requests?id=${encodeURIComponent(
          item.id
        )}&brand=${encodeURIComponent(BRAND_ID)}&permanent=1`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "ลบคำขอถาวรไม่สำเร็จ");
      }

      setCustomerRequestTrash((current) =>
        current.filter((requestItem) => requestItem.id !== item.id)
      );

      invalidateCustomerRequestCache();
      alert("ลบคำขอถาวรเรียบร้อย");
    } catch (error) {
      console.error("Cannot permanently delete customer request", error);
      alert(error?.message || "ลบคำขอถาวรไม่สำเร็จ");
    }
  };

  const normalizedCustomerRequestSearch = search.trim().toLowerCase();

  const filteredCustomerRequestTrash = customerRequestTrash.filter((item) => {
    if (!normalizedCustomerRequestSearch) return true;

    return [
      item.customerName,
      item.phone,
      item.email,
      item.eventLocation,
      item.eventDate,
    ].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(normalizedCustomerRequestSearch)
    );
  });

  const restoreCustomer = async (originalIndex) => {
    const customer = trash[originalIndex];
    if (!customer) return;

    const restoreToArchives =
      customer.deletedFrom === "archives" ||
      (!customer.deletedFrom &&
        Boolean(
          customer.archivedAt ||
            customer.archiveDate ||
            customer.archivedDate ||
            customer.movedToArchiveAt
        ));

    const {
      deletedAt,
      deletedDate,
      deletedFrom,
      ...restoredCustomer
    } = customer;

    const restoredRecord = restoreToArchives
      ? { ...restoredCustomer, restoredAt: new Date().toISOString() }
      : {
          ...restoredCustomer,
          jobStatus: customer.jobStatus || "รอยืนยัน",
          restoredAt: new Date().toISOString(),
        };

    if (customer.supabaseId) {
      const { error } = await supabase
        .from("bookings")
        .update({
          archived: restoreToArchives,
          deleted: false,
          booking_data: getBookingData(restoredRecord),
        })
        .eq("id", customer.supabaseId);

      if (error) {
        console.error("Cannot restore booking", error);
        alert("กู้คืนข้อมูลไม่สำเร็จ");
        return;
      }
    }

    const updatedTrash = trash.filter(
      (_, index) => index !== originalIndex
    );

    localStorage.setItem(
      TRASH_KEY,
      JSON.stringify(updatedTrash)
    );

    setTrash(updatedTrash);

    alert(
      restoreToArchives
        ? "กู้คืนข้อมูลกลับคลังข้อมูลเรียบร้อย"
        : "กู้คืนข้อมูลกลับหน้าข้อมูลลูกค้าเรียบร้อย"
    );
  };

  const deleteForever = async (originalIndex) => {
    if (!window.confirm("ยืนยันการลบถาวร ?")) return;

    const customer = trash[originalIndex];
    if (customer?.supabaseId || customer?.bookingNumber) {
      let deletedRows = [];
      let deleteError = null;

      if (customer.supabaseId) {
        const { data, error } = await supabase
          .from("bookings")
          .delete()
          .eq("id", customer.supabaseId)
          .select("id");

        deletedRows = Array.isArray(data) ? data : [];
        deleteError = error;
      }

      if (
        !deleteError &&
        deletedRows.length === 0 &&
        customer.bookingNumber
      ) {
        const { data, error } = await supabase
          .from("bookings")
          .delete()
          .eq("booking_number", customer.bookingNumber)
          .eq("deleted", true)
          .select("id");

        deletedRows = Array.isArray(data) ? data : [];
        deleteError = error;
      }

      if (deleteError || deletedRows.length === 0) {
        console.error("Cannot delete booking forever", deleteError);
        alert("ลบถาวรไม่สำเร็จ กรุณาตรวจสอบ DELETE policy ใน Supabase");
        return;
      }
    } else {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("deleted", true);

      if (error) {
        console.error("Cannot delete booking forever", error);
        alert("ลบถาวรไม่สำเร็จ");
        return;
      }
    }

    const updatedTrash = trash.filter(
      (_, index) => index !== originalIndex
    );

    localStorage.setItem(
      TRASH_KEY,
      JSON.stringify(updatedTrash)
    );
    setTrash(updatedTrash);

    const calendarError = await deleteCalendarEventSafely(customer);

    alert(
      calendarError
        ? `ลบถาวรเรียบร้อย แต่ลบ Google Calendar Event ไม่สำเร็จ: ${calendarError}`
        : "ลบถาวรเรียบร้อย"
    );
  };

  const clearTrash = async () => {
    if (!window.confirm("ยืนยันการลบข้อมูลทั้งหมดในถังขยะ ?")) return;

    const { data, error } = await supabase
      .from("bookings")
      .delete()
      .eq("deleted", true)
      .select("id");

    if (
      error ||
      (trash.length > 0 && (!Array.isArray(data) || data.length === 0))
    ) {
      console.error("Cannot clear trash", error);
      alert("ล้างถังขยะไม่สำเร็จ กรุณาตรวจสอบ DELETE policy ใน Supabase");
      return;
    }

    localStorage.setItem(TRASH_KEY, "[]");
    setTrash([]);

    const calendarResults = await Promise.all(
      trash.map(deleteCalendarEventSafely)
    );
    const calendarError = calendarResults.find(Boolean);

    alert(
      calendarError
        ? `ล้างถังขยะเรียบร้อย แต่ลบ Google Calendar Event ไม่สำเร็จ: ${calendarError}`
        : "ล้างถังขยะเรียบร้อย"
    );
  };

  const restoreMailTrash = (originalIndex) => {
    const updatedMailTrash = mailTrash.filter(
      (_, index) => index !== originalIndex
    );
    localStorage.setItem(MAIL_TRASH_KEY, JSON.stringify(updatedMailTrash));
    setMailTrash(updatedMailTrash);
    alert("กู้คืนอีเมลกลับหน้าเมลเรียบร้อย");
  };

  const deleteMailTrashForever = (originalIndex) => {
    if (!window.confirm("ยืนยันการลบอีเมลนี้ออกจากขยะเมลถาวร ?")) return;

    const updatedMailTrash = mailTrash.filter(
      (_, index) => index !== originalIndex
    );
    localStorage.setItem(MAIL_TRASH_KEY, JSON.stringify(updatedMailTrash));
    setMailTrash(updatedMailTrash);
    alert("ลบอีเมลออกจากขยะเมลถาวรเรียบร้อย");
  };

  const clearMailTrash = () => {
    if (!window.confirm("ยืนยันการล้างขยะเมลทั้งหมด ?")) return;

    localStorage.setItem(MAIL_TRASH_KEY, "[]");
    setMailTrash([]);
    alert("ล้างขยะเมลเรียบร้อย");
  };

  const filteredTrash = trash
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => {
      const keyword = search.trim().toLowerCase();

      return (
        !keyword ||
        String(item.bookingNumber || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.customerName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.phone || "")
          .toLowerCase()
          .includes(keyword)
      );
    });

  const filteredMailTrash = mailTrash
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => {
      const keyword = search.trim().toLowerCase();

      return (
        !keyword ||
        String(item.bookingNumber || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.customerName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.email || "")
          .toLowerCase()
          .includes(keyword)
      );
    });

  const formatTrashDate = (value) => {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const totalTrashItems =
    trash.length + mailTrash.length + customerRequestTrash.length;

  const visibleTrashItems =
    filteredTrash.length +
    filteredMailTrash.length +
    filteredCustomerRequestTrash.length;

  const trashAccent = BRAND_ID === "pharadol" ? "#173d31" : "#76543b";
  const trashAccentSoft =
    BRAND_ID === "pharadol" ? "#edf7f2" : "#f7f0eb";

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f6f2] px-4 text-zinc-500">
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 text-sm font-semibold shadow-sm">
          กำลังตรวจสอบสิทธิ์การใช้งาน...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f6f2] px-4 py-5 text-zinc-950 sm:px-6 sm:py-7 lg:px-8">
      <div className="mx-auto w-full max-w-[1440px]">
        <header className="overflow-hidden rounded-[28px] border border-zinc-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-5 px-5 py-5 sm:px-7 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-black"
                style={{
                  backgroundColor: trashAccentSoft,
                  color: trashAccent,
                }}
              >
                ♲
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-400">
                  Trash Management
                </p>

                <h1 className="mt-1 text-2xl font-black tracking-[-0.03em] text-zinc-950 sm:text-3xl">
                  ถังขยะ
                </h1>

                <p className="mt-1 text-sm font-medium text-zinc-500">
                  ตรวจสอบ กู้คืน หรือลบข้อมูลออกจากระบบแบบถาวร
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={clearTrash}
                disabled={trash.length === 0}
                className="min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ล้างใบจอง
              </button>

              <button
                type="button"
                onClick={clearMailTrash}
                disabled={mailTrash.length === 0}
                className="min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ล้างอีเมล
              </button>

              <button
                type="button"
                onClick={() => router.push(`/${BRAND_ID}/dashboard`)}
                className="col-span-2 min-h-11 rounded-xl px-5 text-sm font-black text-white transition sm:col-span-1"
                style={brandChrome.primaryButton}
              >
                กลับเมนูหลัก
              </button>
            </div>
          </div>

          <div className="border-t border-zinc-100 bg-zinc-50/70 px-5 py-4 sm:px-7">
            <div className="relative">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาเลขที่จอง ชื่อลูกค้า เบอร์โทร หรืออีเมล"
                className="min-h-[52px] w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-12 pr-4 text-sm font-medium outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100"
              />
            </div>

            {search.trim() && (
              <p className="mt-2 text-xs font-semibold text-zinc-500">
                พบผลการค้นหา {visibleTrashItems} รายการ
              </p>
            )}
          </div>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-zinc-400">
                  ใบจอง
                </p>
                <p className="mt-1 text-2xl font-black text-zinc-900">
                  {trash.length}
                </p>
              </div>

              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black"
                style={{
                  backgroundColor: trashAccentSoft,
                  color: trashAccent,
                }}
              >
                01
              </span>
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-zinc-400">
                  อีเมล
                </p>
                <p className="mt-1 text-2xl font-black text-zinc-900">
                  {mailTrash.length}
                </p>
              </div>

              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-sm font-black text-amber-700">
                02
              </span>
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-zinc-400">
                  คำขอจากลูกค้า
                </p>
                <p className="mt-1 text-2xl font-black text-zinc-900">
                  {customerRequestTrash.length}
                </p>
              </div>

              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sm font-black text-sky-700">
                03
              </span>
            </div>
          </article>
        </section>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-zinc-900">
              รายการทั้งหมด
            </p>
            <p className="mt-0.5 text-xs font-medium text-zinc-500">
              ข้อมูลในถังขยะรวม {totalTrashItems} รายการ
            </p>
          </div>

          <span className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-black text-zinc-600 shadow-sm">
            {totalTrashItems} รายการ
          </span>
        </div>

        <section className="mt-4 rounded-[26px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                Bookings
              </p>
              <h2 className="mt-1 text-lg font-black text-zinc-900">
                ใบจองในถังขยะ
              </h2>
            </div>

            <span
              className="rounded-full px-3 py-1.5 text-xs font-black"
              style={{
                backgroundColor: trashAccentSoft,
                color: trashAccent,
              }}
            >
              {filteredTrash.length} รายการ
            </span>
          </div>

          {filteredTrash.length > 0 ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {filteredTrash.map(({ item, originalIndex }) => {
                const restoreToArchives =
                  item.deletedFrom === "archives" ||
                  (!item.deletedFrom &&
                    Boolean(
                      item.archivedAt ||
                        item.archiveDate ||
                        item.archivedDate ||
                        item.movedToArchiveAt
                    ));

                return (
                  <article
                    key={`${item.bookingNumber || "trash"}-${originalIndex}`}
                    className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-400">
                          เลขที่จอง
                        </p>
                        <h3 className="mt-1 truncate text-base font-black text-zinc-900">
                          {item.bookingNumber || "-"}
                        </h3>
                      </div>

                      <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-black text-zinc-600">
                        {restoreToArchives ? "กลับคลังข้อมูล" : "กลับข้อมูลลูกค้า"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] font-semibold text-zinc-400">
                          ชื่อลูกค้า
                        </p>
                        <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                          {item.customerName || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] font-semibold text-zinc-400">
                          เบอร์โทร
                        </p>
                        <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                          {item.phone || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] font-semibold text-zinc-400">
                          ประเภทงาน
                        </p>
                        <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                          {item.service || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] font-semibold text-zinc-400">
                          วันที่ลบ
                        </p>
                        <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                          {formatTrashDate(item.deletedAt || item.deletedDate)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => restoreCustomer(originalIndex)}
                        className="min-h-11 rounded-xl text-sm font-black text-white transition hover:opacity-90"
                        style={{ backgroundColor: trashAccent }}
                      >
                        กู้คืน
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteForever(originalIndex)}
                        className="min-h-11 rounded-xl border border-red-200 bg-red-50 text-sm font-black text-red-600 transition hover:bg-red-100"
                      >
                        ลบถาวร
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center">
              <p className="text-sm font-bold text-zinc-500">
                ไม่พบใบจองในถังขยะ
              </p>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-[26px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                Mail
              </p>
              <h2 className="mt-1 text-lg font-black text-zinc-900">
                อีเมลในถังขยะ
              </h2>
            </div>

            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700">
              {filteredMailTrash.length} รายการ
            </span>
          </div>

          {filteredMailTrash.length > 0 ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {filteredMailTrash.map(({ item, originalIndex }) => (
                <article
                  key={`mail-${item.id || item.bookingNumber || item.email || originalIndex}`}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-400">
                        เลขที่จอง
                      </p>
                      <h3 className="mt-1 truncate text-base font-black text-zinc-900">
                        {item.bookingNumber || item.subject || "อีเมล"}
                      </h3>
                    </div>

                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700">
                      ขยะเมล
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-zinc-400">
                        ชื่อลูกค้า
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                        {item.customerName || "-"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-zinc-400">
                        วันที่ลบ
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                        {formatTrashDate(
                          item.deletedAt ||
                            item.deletedDate ||
                            item.sentAt ||
                            item.createdAt
                        )}
                      </p>
                    </div>

                    <div className="col-span-2 rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-zinc-400">
                        อีเมล
                      </p>
                      <p className="mt-1 break-all text-sm font-bold text-zinc-800">
                        {item.email || item.to || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => restoreMailTrash(originalIndex)}
                      className="min-h-11 rounded-xl text-sm font-black text-white transition hover:opacity-90"
                      style={{ backgroundColor: trashAccent }}
                    >
                      กู้คืน
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteMailTrashForever(originalIndex)}
                      className="min-h-11 rounded-xl border border-red-200 bg-red-50 text-sm font-black text-red-600 transition hover:bg-red-100"
                    >
                      ลบถาวร
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center">
              <p className="text-sm font-bold text-zinc-500">
                ไม่พบอีเมลในถังขยะ
              </p>
            </div>
          )}
        </section>

        <section
          data-customer-request-trash="true"
          className="mt-4 rounded-[26px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                Customer Requests
              </p>
              <h2 className="mt-1 text-lg font-black text-zinc-900">
                คำขอจากลูกค้าในถังขยะ
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadCustomerRequestTrash}
                className="min-h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
              >
                รีเฟรช
              </button>

              <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700">
                {filteredCustomerRequestTrash.length} รายการ
              </span>
            </div>
          </div>

          {customerRequestTrashError && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {customerRequestTrashError}
            </p>
          )}

          {filteredCustomerRequestTrash.length > 0 ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {filteredCustomerRequestTrash.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-400">
                        ชื่อลูกค้า
                      </p>
                      <h3 className="mt-1 truncate text-base font-black text-zinc-900">
                        {item.customerName || "ไม่ระบุชื่อ"}
                      </h3>
                    </div>

                    <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700">
                      คำขอ
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-zinc-400">
                        เบอร์โทร
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                        {item.phone || "-"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-zinc-400">
                        วันงาน
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                        {item.eventDate || "-"}
                      </p>
                    </div>

                    <div className="col-span-2 rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-zinc-400">
                        สถานที่จัดงาน
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                        {item.eventLocation || "-"}
                      </p>
                    </div>

                    <div className="col-span-2 rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-zinc-400">
                        วันที่ลบ
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-zinc-800">
                        {formatTrashDate(item.deletedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.slipUrl && (
                      <a
                        href={item.slipUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                      >
                        เปิดดูสลิป
                      </a>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => restoreCustomerRequest(item)}
                      className="min-h-11 rounded-xl text-sm font-black text-white transition hover:opacity-90"
                      style={{ backgroundColor: trashAccent }}
                    >
                      กู้คืน
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteCustomerRequestForever(item)}
                      className="min-h-11 rounded-xl border border-red-200 bg-red-50 text-sm font-black text-red-600 transition hover:bg-red-100"
                    >
                      ลบถาวร
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center">
              <p className="text-sm font-bold text-zinc-500">
                ไม่พบคำขอจากลูกค้าในถังขยะ
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

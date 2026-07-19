"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";
import { deleteBookingGoogleCalendarEvent } from "@/app/lib/googleCalendarClient";

const BRAND_ID = "adisorn";
const TRASH_KEY = "adisorn_trash";
const MAIL_TRASH_KEY = "adisorn_mail_trash";

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

  const [trash, setTrash] = useState([]);
  const [mailTrash, setMailTrash] = useState([]);
  const [customerRequestTrash, setCustomerRequestTrash] = useState([]);
  const [customerRequestTrashError, setCustomerRequestTrashError] =
    useState("");
  const [search, setSearch] = useState("");

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
  }, []);

  useEffect(() => {
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
  }, []);


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

  return (
    <main
      className="min-h-screen overflow-x-hidden p-4 md:p-6 lg:p-10"
      style={{ backgroundColor: brandChrome.theme.background, color: brandChrome.theme.text }}
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold md:text-4xl">🗑️ ถังขยะ</h1>
            <p className="mt-2 text-zinc-500">
              รายการที่ถูกลบและสามารถกู้คืนได้
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">

            <button
              type="button"
              onClick={clearTrash}
              disabled={trash.length === 0}
              className="min-h-12 rounded-xl bg-[#DC2626] px-5 py-3 font-semibold text-white hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ล้างถังขยะทั้งหมด
            </button>

            <button
              type="button"
              onClick={clearMailTrash}
              disabled={mailTrash.length === 0}
              className="min-h-12 rounded-xl border border-red-200 bg-white px-5 py-3 font-semibold text-[#DC2626] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ล้างขยะเมล
            </button>

            <button
              type="button"
              onClick={() => router.push("/adisorn/dashboard")}
              className="min-h-12 rounded-xl px-5 py-3 font-semibold text-white transition"
              style={brandChrome.primaryButton}
            >
              เมนูหลัก
            </button>
          </div>
        </div>

        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหาเลขที่จอง ชื่อลูกค้า หรือเบอร์โทร"
          className="mb-6 w-full rounded-xl border border-zinc-300 bg-white p-4"
        />

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-lg font-semibold">
              ถังขยะใบจอง {trash.length} รายการ
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-lg font-semibold">
              ขยะเมล {mailTrash.length} รายการ
            </p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-lg font-semibold">ถังขยะใบจอง</p>
        </div>

        <div className="space-y-4">
          {filteredTrash.length > 0 ? (
            filteredTrash.map(({ item, originalIndex }) => (
              <div
                key={`${item.bookingNumber || "trash"}-${originalIndex}`}
                className="rounded-2xl border bg-white p-5 shadow-sm"
                style={{ borderColor: brandChrome.theme.border }}
              >
                <div className="grid gap-2 text-zinc-700 md:grid-cols-2">
                  <p>
                    <strong>เลขที่จอง:</strong> {item.bookingNumber || "-"}
                  </p>
                  <p>
                    <strong>ชื่อลูกค้า:</strong> {item.customerName || "-"}
                  </p>
                  <p>
                    <strong>เบอร์โทร:</strong> {item.phone || "-"}
                  </p>
                  <p>
                    <strong>ประเภทงาน:</strong> {item.service || "-"}
                  </p>
                  <p>
                    <strong>วันที่ลบ:</strong>{" "}
                    {item.deletedDate || item.deletedAt || "-"}
                  </p>
                  <p>
                    <strong>กู้คืนไปยัง:</strong>{" "}
                    {item.deletedFrom === "archives" ||
                    (!item.deletedFrom &&
                      (item.archivedAt ||
                        item.archiveDate ||
                        item.archivedDate ||
                        item.movedToArchiveAt))
                      ? "คลังข้อมูล"
                      : "ข้อมูลลูกค้า"}
                  </p>
                  <p>
                    <strong>สถานะงาน:</strong>{" "}
                    {item.jobStatus || "รอยืนยัน"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => restoreCustomer(originalIndex)}
                    className="min-h-10 rounded-xl bg-[#16A34A] px-4 py-2 font-semibold text-white hover:bg-[#15803D]"
                  >
                    ♻️ กู้คืน
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteForever(originalIndex)}
                    className="min-h-10 rounded-xl bg-[#DC2626] px-4 py-2 font-semibold text-white hover:bg-[#B91C1C]"
                  >
                    ❌ ลบถาวร
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-white p-10 text-center text-zinc-500 shadow-sm">
              ไม่พบรายการในถังขยะ
            </div>
          )}
        </div>

        <div className="mt-10 mb-4">
          <p className="text-lg font-semibold">ขยะเมล</p>
        </div>

        <div className="space-y-4">
          {filteredMailTrash.length > 0 ? (
            filteredMailTrash.map(({ item, originalIndex }) => (
              <div
                key={`${item.bookingNumber || item.email || "mail-trash"}-${originalIndex}`}
                className="rounded-2xl border bg-white p-5 shadow-sm"
                style={{ borderColor: brandChrome.theme.border }}
              >
                <div className="grid gap-2 text-zinc-700 md:grid-cols-2">
                  <p>
                    <strong>เลขที่จอง:</strong> {item.bookingNumber || "-"}
                  </p>
                  <p>
                    <strong>ชื่อลูกค้า:</strong> {item.customerName || "-"}
                  </p>
                  <p>
                    <strong>อีเมล:</strong> {item.email || "-"}
                  </p>
                  <p>
                    <strong>วันที่ลบ:</strong>{" "}
                    {item.deletedDate || item.deletedAt || "-"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => restoreMailTrash(originalIndex)}
                    className="min-h-10 rounded-xl bg-[#16A34A] px-4 py-2 font-semibold text-white hover:bg-[#15803D]"
                  >
                    กู้คืนเมล
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteMailTrashForever(originalIndex)}
                    className="min-h-10 rounded-xl bg-[#DC2626] px-4 py-2 font-semibold text-white hover:bg-[#B91C1C]"
                  >
                    ลบถาวร
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-white p-10 text-center text-zinc-500 shadow-sm">
              ไม่พบรายการในขยะเมล
            </div>
          )}
        </div>
      </div>
    
      <section
        data-customer-request-trash="true"
        className="mt-8 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
              Customer Requests
            </p>
            <h2 className="mt-1 text-xl font-black text-zinc-900">
              คำขอจากลูกค้าในถังขยะ
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              กู้คืนกลับหน้าคำขอ หรือลบออกจากระบบแบบถาวร
            </p>
          </div>

          <span className="inline-flex min-h-9 items-center rounded-full bg-zinc-100 px-4 text-sm font-black text-zinc-700">
            {filteredCustomerRequestTrash.length} รายการ
          </span>
        </div>

        {customerRequestTrashError && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {customerRequestTrashError}
          </p>
        )}

        {filteredCustomerRequestTrash.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {filteredCustomerRequestTrash.map((item) => (
              <article
                key={item.id}
                className="rounded-[18px] border border-zinc-200 bg-zinc-50/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black text-zinc-900">
                      {item.customerName || "ไม่ระบุชื่อลูกค้า"}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-zinc-400">
                      ลบเมื่อ{" "}
                      {item.deletedAt
                        ? new Date(item.deletedAt).toLocaleString("th-TH")
                        : "-"}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-black text-red-600">
                    ในถังขยะ
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-xs font-semibold text-zinc-400">
                      เบอร์โทร
                    </p>
                    <p className="mt-1 font-bold text-zinc-800">
                      {item.phone || "-"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-xs font-semibold text-zinc-400">
                      วันงาน
                    </p>
                    <p className="mt-1 font-bold text-zinc-800">
                      {item.eventDate || "-"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white px-3 py-2 sm:col-span-2">
                    <p className="text-xs font-semibold text-zinc-400">
                      สถานที่จัดงาน
                    </p>
                    <p className="mt-1 font-bold text-zinc-800">
                      {item.eventLocation || "-"}
                    </p>
                  </div>
                </div>

                {item.slipUrl && (
                  <a
                    href={item.slipUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                  >
                    เปิดดูสลิป
                  </a>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => restoreCustomerRequest(item)}
                    className="min-h-11 rounded-xl px-3 text-sm font-black text-white"
                    style={{
                      backgroundColor:
                        BRAND_ID === "pharadol" ? "#173d31" : "#76543b",
                    }}
                  >
                    กู้คืน
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteCustomerRequestForever(item)}
                    className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-black text-red-600 hover:bg-red-100"
                  >
                    ลบถาวร
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm font-semibold text-zinc-500">
            ไม่พบคำขอจากลูกค้าในถังขยะ
          </div>
        )}
      </section>

</main>
  );
}

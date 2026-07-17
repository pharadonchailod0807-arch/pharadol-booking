"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";

const BRAND_ID = "adisorn";
const CUSTOMERS_KEY = `${BRAND_ID}_customers`;
const SELECTED_BOOKING_KEY = `${BRAND_ID}_selectedBooking`;
const CURRENT_BOOKING_KEY = `${BRAND_ID}_currentBooking`;
const ARCHIVES_KEY = `${BRAND_ID}_archives`;
const TRASH_KEY = `${BRAND_ID}_trash`;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const ROUTES = {
  booking: "/adisorn",
  bookingView: "/adisorn?view=customer",
  dashboard: "/adisorn/dashboard",
  archives: "/adisorn/archives",
  trash: "/adisorn/trash",
};

export default function CustomersPage() {
  const router = useRouter();
  const brandChrome = getBrandChromeStyles(BRAND_ID);

  const goTo = (route) => {
    router.push(route);
  };

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

  const getBookingData = (customer, updates = {}) => {
    const { supabaseId, ...bookingData } = customer;
    return { ...bookingData, ...updates, brandId: BRAND_ID };
  };

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("bookingNumber");
  const [sortDirection, setSortDirection] = useState("desc");
  const [selectedBookingNumbers, setSelectedBookingNumbers] = useState([]);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const syncCustomers = useCallback((nextCustomers) => {
    localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(nextCustomers));
    setCustomers(nextCustomers);
  }, []);

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const users = JSON.parse(
          localStorage.getItem("central_admin_users") || "[]"
        );
        const latestAccount = Array.isArray(users)
          ? users.find((user) => user.id === currentUser?.id)
          : null;
        const isAdmin = currentUser?.role === "ADMIN";
        const hasBrandAccess = currentUser?.brands?.includes("adisorn");
        const accountIsActive = latestAccount?.active === true;
        const brandIsCorrect =
          activeBrand === "adisorn" && (isAdmin || hasBrandAccess);
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
        console.error("Cannot verify Adisorn access", error);
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

    const handleStorage = (event) => {
      if (event.key === "central_admin_users") {
        verifyAccess();
      }
    };

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearInterval(sessionCheck);
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    const loadCustomers = async () => {
      try {
        const { data, error } = await supabase
          .from("bookings")
          .select("*")
          .eq("archived", false)
          .eq("deleted", false)
          .order("booking_number", { ascending: false });

        if (error) throw error;

        const normalizedCustomers = (Array.isArray(data) ? data : [])
          .map(normalizeBookingRow)
          .filter((customer) => customer.brandId === BRAND_ID);

        syncCustomers(normalizedCustomers);
      } catch (error) {
        console.error("Cannot load customer data", error);
        const savedCustomers = JSON.parse(
          localStorage.getItem(CUSTOMERS_KEY) || "[]"
        );
        setCustomers(Array.isArray(savedCustomers) ? savedCustomers : []);
      }
    };

    const handleStorage = (event) => {
      if (!event || event.key === CUSTOMERS_KEY) {
        loadCustomers();
      }
    };

    const handlePageVisible = () => {
      if (document.visibilityState === "visible") {
        loadCustomers();
      }
    };

    const bookingsChannel = supabase
      .channel(`${BRAND_ID}-customers-bookings`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        loadCustomers
      )
      .subscribe();

    loadCustomers();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", loadCustomers);
    window.addEventListener("pageshow", loadCustomers);
    document.addEventListener("visibilitychange", handlePageVisible);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", loadCustomers);
      window.removeEventListener("pageshow", loadCustomers);
      document.removeEventListener("visibilitychange", handlePageVisible);
      supabase.removeChannel(bookingsChannel);
    };
  }, [isAuthorized, syncCustomers]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const matchedCustomers = !keyword
      ? [...customers]
      : customers.filter((customer) =>
          [
            customer.bookingNumber,
            customer.customerName,
            customer.phone,
            customer.email,
            customer.service,
            customer.location,
            customer.jobStatus,
            customer.status,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(keyword)
            )
        );

    return matchedCustomers.sort((a, b) => {
      let firstValue = "";
      let secondValue = "";

      if (sortBy === "customerName") {
        firstValue = String(a.customerName || "");
        secondValue = String(b.customerName || "");
      } else if (sortBy === "jobStatus") {
        firstValue = String(a.jobStatus || a.status || "รอดำเนินการ");
        secondValue = String(b.jobStatus || b.status || "รอดำเนินการ");
      } else if (sortBy === "eventDate") {
        firstValue = new Date(a.eventDate || 0).getTime();
        secondValue = new Date(b.eventDate || 0).getTime();
      } else {
        firstValue = String(a.bookingNumber || "");
        secondValue = String(b.bookingNumber || "");
      }

      if (typeof firstValue === "number" && typeof secondValue === "number") {
        return sortDirection === "asc"
          ? firstValue - secondValue
          : secondValue - firstValue;
      }

      return sortDirection === "asc"
        ? firstValue.localeCompare(secondValue, "th")
        : secondValue.localeCompare(firstValue, "th");
    });
  }, [customers, search, sortBy, sortDirection]);

  const visibleBookingNumbers = filteredCustomers
    .map((customer) => customer.bookingNumber)
    .filter(Boolean);

  const allVisibleSelected =
    visibleBookingNumbers.length > 0 &&
    visibleBookingNumbers.every((bookingNumber) =>
      selectedBookingNumbers.includes(bookingNumber)
    );

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedBookingNumbers((current) =>
        current.filter(
          (bookingNumber) => !visibleBookingNumbers.includes(bookingNumber)
        )
      );
      return;
    }

    setSelectedBookingNumbers((current) => [
      ...new Set([...current, ...visibleBookingNumbers]),
    ]);
  };

  const toggleCustomerSelection = (bookingNumber) => {
    if (!bookingNumber) return;

    setSelectedBookingNumbers((current) =>
      current.includes(bookingNumber)
        ? current.filter((item) => item !== bookingNumber)
        : [...current, bookingNumber]
    );
  };

  const bulkMoveToArchive = async () => {
    if (selectedBookingNumbers.length === 0) return;

    const confirmed = window.confirm(
      `ต้องการจัดเก็บใบจองที่เลือก ${selectedBookingNumbers.length} รายการหรือไม่?`
    );
    if (!confirmed) return;

    const archivedItems = JSON.parse(
      localStorage.getItem(ARCHIVES_KEY) || "[]"
    );
    const selectedSet = new Set(selectedBookingNumbers);
    const selectedCustomers = customers
      .filter((customer) => selectedSet.has(customer.bookingNumber))
      .map((customer) => ({
        ...customer,
        archivedAt: new Date().toISOString(),
      }));
    const updatedCustomers = customers.filter(
      (customer) => !selectedSet.has(customer.bookingNumber)
    );

    const archiveResults = await Promise.all(
      selectedCustomers
        .filter((customer) => customer.supabaseId)
        .map((customer) =>
          supabase
            .from("bookings")
            .update({
              archived: true,
              booking_data: getBookingData(customer, {
                archivedAt: customer.archivedAt,
              }),
            })
            .eq("id", customer.supabaseId)
        )
    );
    const archiveError = archiveResults.find((result) => result.error)?.error;

    if (archiveError) {
      console.error("Cannot archive selected bookings", archiveError);
      alert("ไม่สามารถจัดเก็บรายการที่เลือกได้ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    syncCustomers(updatedCustomers);
    localStorage.setItem(
      ARCHIVES_KEY,
      JSON.stringify([...selectedCustomers, ...archivedItems])
    );
    setSelectedBookingNumbers([]);
    alert("จัดเก็บข้อมูลที่เลือกเรียบร้อย");
  };

  const bulkMoveToTrash = async () => {
    if (selectedBookingNumbers.length === 0) return;

    const confirmed = window.confirm(
      `ต้องการย้ายใบจองที่เลือก ${selectedBookingNumbers.length} รายการไปถังขยะหรือไม่?`
    );
    if (!confirmed) return;

    const trashItems = JSON.parse(
      localStorage.getItem(TRASH_KEY) || "[]"
    );
    const selectedSet = new Set(selectedBookingNumbers);
    const deletedAt = new Date();
    const selectedCustomers = customers
      .filter((customer) => selectedSet.has(customer.bookingNumber))
      .map((customer) => ({
        ...customer,
        deletedFrom: "customers",
        deletedAt: deletedAt.toISOString(),
        deletedDate: deletedAt.toLocaleString("th-TH"),
      }));
    const updatedCustomers = customers.filter(
      (customer) => !selectedSet.has(customer.bookingNumber)
    );

    const trashResults = await Promise.all(
      selectedCustomers
        .filter((customer) => customer.supabaseId)
        .map((customer) =>
          supabase
            .from("bookings")
            .update({
              deleted: true,
              booking_data: getBookingData(customer, {
                deletedFrom: "customers",
                deletedAt: customer.deletedAt,
                deletedDate: customer.deletedDate,
              }),
            })
            .eq("id", customer.supabaseId)
        )
    );
    const trashError = trashResults.find((result) => result.error)?.error;

    if (trashError) {
      console.error("Cannot trash selected bookings", trashError);
      alert("ไม่สามารถย้ายรายการที่เลือกไปถังขยะได้ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    syncCustomers(updatedCustomers);
    localStorage.setItem(
      TRASH_KEY,
      JSON.stringify([...selectedCustomers, ...trashItems])
    );
    setSelectedBookingNumbers([]);
    alert("ย้ายข้อมูลที่เลือกไปถังขยะเรียบร้อย");
  };

  const openBooking = (customer) => {
    localStorage.setItem(SELECTED_BOOKING_KEY, JSON.stringify(customer));
    localStorage.setItem(CURRENT_BOOKING_KEY, JSON.stringify(customer));
    router.push(ROUTES.bookingView, { scroll: false });
  };

  const moveToArchive = async (customer) => {
    const confirmed = window.confirm(
      `ต้องการจัดเก็บใบจอง ${customer.bookingNumber || "นี้"} หรือไม่?`
    );

    if (!confirmed) return;

    const archivedItems = JSON.parse(
      localStorage.getItem(ARCHIVES_KEY) || "[]"
    );

    const updatedCustomers = customers.filter(
      (item) => item.bookingNumber !== customer.bookingNumber
    );

    const archiveRecord = {
      ...customer,
      archivedAt: new Date().toISOString(),
    };

    if (customer.supabaseId) {
      const { error } = await supabase
        .from("bookings")
        .update({
          archived: true,
          booking_data: getBookingData(customer, {
            archivedAt: archiveRecord.archivedAt,
          }),
        })
        .eq("id", customer.supabaseId);

      if (error) {
        console.error("Cannot archive booking", error);
        alert("ไม่สามารถจัดเก็บข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
        return;
      }
    }

    syncCustomers(updatedCustomers);
    localStorage.setItem(
      ARCHIVES_KEY,
      JSON.stringify([archiveRecord, ...archivedItems])
    );

    alert("จัดเก็บข้อมูลเรียบร้อย");
  };

  const moveToTrash = async (customer) => {
    const confirmed = window.confirm(
      `ต้องการย้ายใบจอง ${customer.bookingNumber || "นี้"} ไปถังขยะหรือไม่?`
    );

    if (!confirmed) return;

    try {
      const savedTrash = JSON.parse(
        localStorage.getItem(TRASH_KEY) || "[]"
      );

      const trashItems = Array.isArray(savedTrash)
        ? savedTrash
        : [];

      const updatedCustomers = customers.filter(
        (item) => item.bookingNumber !== customer.bookingNumber
      );

      const deletedAt = new Date();
      const trashRecord = {
        ...customer,
        deletedFrom: "customers",
        deletedAt: deletedAt.toISOString(),
        deletedDate: deletedAt.toLocaleString("th-TH"),
      };

      const updatedTrash = [trashRecord, ...trashItems];

      if (customer.supabaseId) {
        const { error } = await supabase
          .from("bookings")
          .update({
            deleted: true,
            booking_data: getBookingData(customer, {
              deletedFrom: "customers",
              deletedAt: trashRecord.deletedAt,
              deletedDate: trashRecord.deletedDate,
            }),
          })
          .eq("id", customer.supabaseId);

        if (error) {
          console.error("Cannot move booking to trash", error);
          alert("ไม่สามารถย้ายข้อมูลไปถังขยะได้ กรุณาลองใหม่อีกครั้ง");
          return;
        }
      }

      localStorage.setItem(TRASH_KEY, JSON.stringify(updatedTrash));
      syncCustomers(updatedCustomers);
      alert("ย้ายข้อมูลไปถังขยะเรียบร้อย");
    } catch (error) {
      console.error("Cannot move booking to trash", error);
      alert("ไม่สามารถย้ายข้อมูลไปถังขยะได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const updateJobStatus = async (customer, newStatus) => {
    try {
      const updatedCustomers = customers.map((item) =>
        item.bookingNumber === customer.bookingNumber
          ? {
              ...item,
              jobStatus: newStatus,
              status: newStatus,
              updatedAt: new Date().toISOString(),
            }
          : item
      );

      if (customer.supabaseId) {
        const updatedCustomer =
          updatedCustomers.find(
            (item) => item.bookingNumber === customer.bookingNumber
          ) || customer;
        const { error } = await supabase
          .from("bookings")
          .update({
            job_status: newStatus,
            booking_data: getBookingData(updatedCustomer),
          })
          .eq("id", customer.supabaseId);

        if (error) throw error;
      }

      syncCustomers(updatedCustomers);
    } catch (error) {
      console.error("Cannot update job status", error);
      alert("ไม่สามารถอัปเดตสถานะงานได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const getStatusClassName = (status) => {
    const normalizedStatus = String(status || "").trim();

    if (["เสร็จสิ้น", "ส่งมอบแล้ว", "ปิดงานแล้ว"].includes(normalizedStatus)) {
      return "bg-emerald-100 text-emerald-700";
    }

    if (["กำลังดำเนินการ", "กำลังถ่ายทำ", "กำลังตัดต่อ"].includes(normalizedStatus)) {
      return "bg-blue-100 text-blue-700";
    }

    if (["ยกเลิก", "ยกเลิกงาน"].includes(normalizedStatus)) {
      return "bg-red-50 text-red-700";
    }

    return "border border-[#E7C77D] bg-[#FFF3D7] text-[#9A5B00]";
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
      className="min-h-screen overflow-x-hidden p-4 md:p-6 xl:p-8"
      style={{ backgroundColor: brandChrome.theme.background, color: brandChrome.theme.text }}
    >
      <div className="mx-auto w-full max-w-[1840px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">ข้อมูลลูกค้า</h1>
            <p className="mt-1 text-zinc-500">
              รายการใบจองทั้งหมด {customers.length} รายการ
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => goTo(ROUTES.booking)}
              className="min-h-12 rounded-xl border bg-white px-4 py-2 font-semibold transition hover:bg-[#F3E6CF]"
              style={brandChrome.secondaryButton}
            >
              กลับหน้าสร้างใบจอง
            </button>

            <button
              type="button"
              onClick={() => goTo(ROUTES.dashboard)}
              className="min-h-12 rounded-xl px-4 py-2 font-semibold text-white transition"
              style={brandChrome.primaryButton}
            >
              เมนูหลัก
            </button>
          </div>
        </div>

        <div
          className="mb-5 rounded-3xl border bg-white p-5 shadow-sm"
          style={{ borderColor: brandChrome.theme.border }}
        >
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 flex-1">
              <label className="mb-2 block text-sm font-semibold text-zinc-700">
                ค้นหาข้อมูล
              </label>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาเลขที่จอง ชื่อลูกค้า เบอร์โทร ประเภทงาน หรือสถานะงาน"
                className="w-full rounded-2xl border border-zinc-300 bg-zinc-50 px-5 py-4 text-base outline-none transition focus:border-zinc-900 focus:bg-white"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="mb-2 text-sm font-semibold text-zinc-700">
                  เรียงตาม
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {[
                    ["bookingNumber", "เลขที่จอง"],
                    ["customerName", "ชื่อลูกค้า"],
                    ["jobStatus", "สถานะงาน"],
                    ["eventDate", "วันที่งาน"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSortBy(value)}
                      className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                        sortBy === value
                          ? "text-white shadow-sm"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                      style={sortBy === value ? brandChrome.activeControl : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

            <button
              type="button"
              onClick={() =>
                setSortDirection((current) =>
                  current === "asc" ? "desc" : "asc"
                )
              }
              className="h-12 whitespace-nowrap rounded-2xl border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              {sortDirection === "asc" ? "↑ น้อยไปมาก" : "↓ มากไปน้อย"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={visibleBookingNumbers.length === 0}
              className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                allVisibleSelected
                  ? "text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              } disabled:cursor-not-allowed disabled:opacity-40`}
              style={allVisibleSelected ? brandChrome.activeControl : undefined}
            >
              {allVisibleSelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
            </button>

            {selectedBookingNumbers.length > 0 && (
              <>
                <span className="rounded-xl bg-[#F3E6CF] px-3 py-2 text-sm font-semibold text-[#4A2E22]">
                  เลือกแล้ว {selectedBookingNumbers.length} รายการ
                </span>
                <button
                  type="button"
                  onClick={bulkMoveToArchive}
                  className="min-h-12 rounded-2xl bg-[#C9A46A] px-4 py-3 text-sm font-semibold text-[#111111] hover:bg-[#B88F52]"
                >
                  จัดเก็บ
                </button>
                <button
                  type="button"
                  onClick={bulkMoveToTrash}
                  className="min-h-12 rounded-2xl bg-[#DC2626] px-4 py-3 text-sm font-semibold text-white hover:bg-[#B91C1C]"
                >
                  ถังขยะ
                </button>
              </>
            )}
          </div>
        </div>
        </div>

        <div className="grid gap-3 md:hidden">
          {filteredCustomers.length > 0 ? (
            filteredCustomers.map((customer, index) => {
              const jobStatus =
                customer.jobStatus || customer.status || "รอดำเนินการ";
              const isSelected = selectedBookingNumbers.includes(
                customer.bookingNumber
              );

              return (
                <article
                  key={customer.bookingNumber || index}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    isSelected ? "border-[#C9A46A] ring-2 ring-[#F3E6CF]" : "border-zinc-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() =>
                          toggleCustomerSelection(customer.bookingNumber)
                        }
                        aria-label={`เลือกใบจอง ${
                          customer.bookingNumber || "นี้"
                        }`}
                        className="mt-1 h-5 w-5 cursor-pointer accent-[#4A2E22]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-zinc-900">
                          {customer.bookingNumber || "-"}
                        </span>
                        <span className="mt-1 block break-words text-lg font-bold text-zinc-950">
                          {customer.customerName || "-"}
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-zinc-600">
                    <p>
                      <span className="font-semibold text-zinc-500">โทร:</span>{" "}
                      {customer.phone || "-"}
                    </p>
                    <p>
                      <span className="font-semibold text-zinc-500">งาน:</span>{" "}
                      {customer.service || "-"}
                    </p>
                    <p>
                      <span className="font-semibold text-zinc-500">วันที่:</span>{" "}
                      {customer.formattedEventDate ||
                        (customer.eventDate
                          ? new Date(customer.eventDate).toLocaleDateString("th-TH")
                          : "-")}
                    </p>
                  </div>

                  <select
                    value={jobStatus}
                    onChange={(event) =>
                      updateJobStatus(customer, event.target.value)
                    }
                    className={`mt-4 w-full rounded-xl border-0 px-3 py-2.5 text-sm font-semibold outline-none ring-1 ring-inset ring-black/10 ${getStatusClassName(
                      jobStatus
                    )}`}
                  >
                    <option value="รอดำเนินการ">รอดำเนินการ</option>
                    <option value="กำลังดำเนินการ">กำลังดำเนินการ</option>
                    <option value="กำลังถ่ายทำ">กำลังถ่ายทำ</option>
                    <option value="กำลังตัดต่อ">กำลังตัดต่อ</option>
                    <option value="ส่งมอบแล้ว">ส่งมอบแล้ว</option>
                    <option value="เสร็จสิ้น">เสร็จสิ้น</option>
                    <option value="ยกเลิกงาน">ยกเลิกงาน</option>
                  </select>

                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => openBooking(customer)}
                      className="min-h-11 rounded-xl bg-[#4A2E22] px-3 py-2 text-sm font-semibold text-white hover:bg-[#5A3828]"
                    >
                      ดูใบจอง
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => moveToArchive(customer)}
                        className="min-h-11 rounded-xl bg-[#C9A46A] px-3 py-2 text-sm font-semibold text-[#111111] hover:bg-[#B88F52]"
                      >
                        จัดเก็บ
                      </button>
                      <button
                        type="button"
                        onClick={() => moveToTrash(customer)}
                        className="min-h-11 rounded-xl bg-[#DC2626] px-3 py-2 text-sm font-semibold text-white hover:bg-[#B91C1C]"
                      >
                        ถังขยะ
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-2xl bg-white p-8 text-center text-zinc-500 shadow-sm">
              ไม่พบข้อมูลลูกค้า
            </div>
          )}
        </div>

        <div className="hidden w-full overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
          <div className="min-w-[1120px]">
            <div
              className="grid grid-cols-[44px_1fr_1fr_0.9fr_0.9fr_0.8fr_300px] gap-3 px-4 py-4 text-sm font-semibold text-white lg:gap-4 lg:px-5"
              style={brandChrome.tableHeader}
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  aria-label="เลือกใบจองทั้งหมดที่แสดง"
                  className="h-5 w-5 cursor-pointer accent-[#4A2E22]"
                />
              </div>
              <div>เลขที่การจอง</div>
              <div>ชื่อลูกค้า</div>
              <div>ประเภทงาน</div>
              <div>วันที่งาน</div>
              <div>สถานะงาน</div>
              <div className="text-center">จัดการ</div>
            </div>

            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer, index) => {
                const jobStatus =
                  customer.jobStatus || customer.status || "รอดำเนินการ";

                return (
                  <div
                    key={customer.bookingNumber || index}
                    className={`grid grid-cols-[44px_1fr_1fr_0.9fr_0.9fr_0.8fr_300px] items-center gap-3 border-t px-4 py-4 text-sm transition lg:gap-4 lg:px-5 ${
                      selectedBookingNumbers.includes(customer.bookingNumber)
                        ? "border-[#C9A46A]/60 bg-[#F3E6CF]/45"
                        : "border-zinc-200"
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedBookingNumbers.includes(
                          customer.bookingNumber
                        )}
                        onChange={() =>
                          toggleCustomerSelection(customer.bookingNumber)
                        }
                        aria-label={`เลือกใบจอง ${
                          customer.bookingNumber || "นี้"
                        }`}
                        className="h-5 w-5 cursor-pointer accent-[#4A2E22]"
                      />
                    </div>

                    <div className="font-semibold">
                      {customer.bookingNumber || "-"}
                    </div>

                    <div>
                      <p className="font-semibold">
                        {customer.customerName || "-"}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {customer.phone || "-"}
                      </p>
                    </div>

                    <div>{customer.service || "-"}</div>

                    <div>
                      {customer.formattedEventDate ||
                        (customer.eventDate
                          ? new Date(customer.eventDate).toLocaleDateString("th-TH")
                          : "-")}
                    </div>

                    <div>
                      <select
                        value={jobStatus}
                        onChange={(event) =>
                          updateJobStatus(customer, event.target.value)
                        }
                        className={`w-full rounded-xl border-0 px-3 py-2 text-sm font-semibold outline-none ring-1 ring-inset ring-black/10 ${getStatusClassName(
                          jobStatus
                        )}`}
                      >
                        <option value="รอดำเนินการ">รอดำเนินการ</option>
                        <option value="กำลังดำเนินการ">กำลังดำเนินการ</option>
                        <option value="กำลังถ่ายทำ">กำลังถ่ายทำ</option>
                        <option value="กำลังตัดต่อ">กำลังตัดต่อ</option>
                        <option value="ส่งมอบแล้ว">ส่งมอบแล้ว</option>
                        <option value="เสร็จสิ้น">เสร็จสิ้น</option>
                        <option value="ยกเลิกงาน">ยกเลิกงาน</option>
                      </select>
                    </div>

                    <div className="flex flex-nowrap items-center justify-center gap-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openBooking(customer)}
                        className="min-h-10 rounded-xl bg-[#4A2E22] px-3 py-2 text-sm font-semibold text-white hover:bg-[#5A3828]"
                      >
                        ดูใบจอง
                      </button>

                      <button
                        type="button"
                        onClick={() => moveToArchive(customer)}
                        className="min-h-10 rounded-xl bg-[#C9A46A] px-3 py-2 text-sm font-semibold text-[#111111] hover:bg-[#B88F52]"
                      >
                        จัดเก็บ
                      </button>

                      <button
                        type="button"
                        onClick={() => moveToTrash(customer)}
                        className="min-h-10 rounded-xl bg-[#DC2626] px-3 py-2 text-sm font-semibold text-white hover:bg-[#B91C1C]"
                      >
                        ถังขยะ
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-10 text-center text-zinc-500">
                ไม่พบข้อมูลลูกค้า
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

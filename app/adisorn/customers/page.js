"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import listStyles from "@/app/components/CustomerBookingList.module.css";
import CustomerSourceIndicator from "@/app/components/CustomerSourceIndicator";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";
import {
  bangkokTodayTime, CUSTOMER_SORT_OPTIONS, EVENT_DATE_FILTERS,
  formatCustomerCreatedAt, formatCustomerEventDate, selectCustomerBookings,
} from "@/app/lib/customerBookingList";
import { syncBookingGoogleCalendar } from "@/app/lib/googleCalendarClient";
import { safeGetArray, safeGetObject, safeSetJson } from "@/app/lib/safeStorage";

const BRAND_ID = "adisorn";
const CUSTOMERS_KEY = `${BRAND_ID}_customers`;
const SELECTED_BOOKING_KEY = `${BRAND_ID}_selectedBooking`;
const CURRENT_BOOKING_KEY = `${BRAND_ID}_currentBooking`;
const ARCHIVES_KEY = `${BRAND_ID}_archives`;
const TRASH_KEY = `${BRAND_ID}_trash`;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const BOOKING_LIST_PAGE_SIZE = 30;

const ROUTES = {
  booking: "/adisorn",
  bookingView: "/adisorn?view=customer",
  dashboard: "/adisorn/dashboard",
  archives: "/adisorn/archives",
  trash: "/adisorn/trash",
};

const isRecordObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

export default function CustomersPage() {
  const router = useRouter();
  const brandChrome = getBrandChromeStyles(BRAND_ID);
  const listChrome = getBrandChromeStyles("pharadol");

  const goTo = (route) => {
    router.push(route);
  };

  const syncTrashCalendarEvent = async (booking) => {
    if (!booking?.googleCalendarEventId) return "";

    try {
      await syncBookingGoogleCalendar({
        brand: BRAND_ID,
        booking,
        mode: "trash",
      });
      return "";
    } catch (error) {
      console.error("Cannot update Google Calendar trash status", error);
      return error?.message || "ซิงก์ Google Calendar ไม่สำเร็จ";
    }
  };

  const normalizeBookingRow = useCallback((row) => {
    const rowData = isRecordObject(row) ? row : {};
    const bookingData = isRecordObject(rowData.booking_data)
      ? rowData.booking_data
      : rowData;

    return {
      ...bookingData,
      supabaseId: rowData.id || rowData.supabaseId || "",
      brandId: bookingData.brandId || rowData.brandId || rowData.brand || "",
      bookingNumber: bookingData.bookingNumber || rowData.booking_number || rowData.bookingNumber || "",
      customerName: bookingData.customerName || rowData.customer_name || rowData.customerName || "",
      phone: bookingData.phone || rowData.phone || "",
      email: bookingData.email || rowData.email || "",
      service: bookingData.service || rowData.service || "",
      location: bookingData.location || rowData.location || "",
      eventDate: bookingData.eventDate || rowData.event_date || rowData.eventDate || "",
      jobStatus: rowData.job_status || bookingData.jobStatus || "รอยืนยัน",
      status: rowData.job_status || bookingData.status || bookingData.jobStatus || "รอยืนยัน",
      customerSource: bookingData.customerSource || null,
      customerSourceDetail: bookingData.customerSourceDetail || "",
    };
  }, []);

  const normalizeBookingList = useCallback(
    (items) =>
      Array.isArray(items)
        ? items.filter(isRecordObject).map(normalizeBookingRow)
        : [],
    [normalizeBookingRow]
  );

  const fetchCustomerList = useCallback(async (signal) => {
    const params = new URLSearchParams({
      mode: "list", view: "customers", brand: BRAND_ID, status: "active",
    });
    const response = await fetch(`/api/bookings?${params.toString()}`, {
      cache: "no-store", signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "โหลดข้อมูลลูกค้าไม่สำเร็จ");
    }
    return normalizeBookingList(result.bookings);
  }, [normalizeBookingList]);

  const fetchFullBooking = useCallback(async (customer) => {
    const params = new URLSearchParams({
      mode: "detail",
      brand: BRAND_ID,
    });
    if (customer?.supabaseId) {
      params.set("id", customer.supabaseId);
    } else {
      params.set("bookingNumber", customer?.bookingNumber || "");
    }

    const response = await fetch(`/api/bookings?${params.toString()}`, {
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success || !result.booking) {
      throw new Error(result.error || "โหลดรายละเอียดใบจองไม่สำเร็จ");
    }

    return normalizeBookingRow(result.booking);
  }, [normalizeBookingRow]);

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
  const [visibleCount, setVisibleCount] = useState(BOOKING_LIST_PAGE_SIZE);
  const [dateFilter, setDateFilter] = useState("all");
  const [today, setToday] = useState(() => bangkokTodayTime());
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState("");
  const listRequest = useRef(null);

  const syncCustomers = useCallback((nextCustomers) => {
    safeSetJson(CUSTOMERS_KEY, nextCustomers);
    setCustomers(nextCustomers);
  }, []);

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = safeGetObject("currentUser", {
          storage: "session",
          maxBytes: 64 * 1024,
        });
        const activeBrand = sessionStorage.getItem("activeBrand");
        const users = safeGetArray("central_admin_users", { maxBytes: 256 * 1024 });
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
      listRequest.current?.abort();
      const controller = new AbortController();
      listRequest.current = controller;
      setIsLoading(true);
      setListError("");
      try {
        const bookings = await fetchCustomerList(controller.signal);
        if (!controller.signal.aborted) syncCustomers(bookings);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Cannot load customer data", error);
        setListError(error?.message || "โหลดข้อมูลลูกค้าไม่สำเร็จ กรุณาโหลดหน้าใหม่");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
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
      listRequest.current?.abort();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", loadCustomers);
      window.removeEventListener("pageshow", loadCustomers);
      document.removeEventListener("visibilitychange", handlePageVisible);
      supabase.removeChannel(bookingsChannel);
    };
  }, [fetchCustomerList, isAuthorized, syncCustomers]);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(bangkokTodayTime()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const matchedCustomers = useMemo(() => selectCustomerBookings(customers, {
    search, sortBy, sortDirection, dateFilter, today,
  }), [customers, search, sortBy, sortDirection, dateFilter, today]);
  const filteredCustomers = matchedCustomers.slice(0, visibleCount);
  const hasMoreCustomers = filteredCustomers.length < matchedCustomers.length;

  const changeSort = (value) => {
    setVisibleCount(BOOKING_LIST_PAGE_SIZE);
    if (sortBy === value) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortBy(value);
      setSortDirection("asc");
    }
  };

  const changeDateFilter = (value) => {
    setDateFilter(value);
    setVisibleCount(BOOKING_LIST_PAGE_SIZE);
    if (value !== "all") {
      setSortBy("eventDate");
      setSortDirection("asc");
    }
  };

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

    const archivedItems = safeGetArray(ARCHIVES_KEY);
    const selectedSet = new Set(selectedBookingNumbers);
    const selectedCustomers = await Promise.all(
      customers
        .filter((customer) => selectedSet.has(customer.bookingNumber))
        .map(async (customer) => ({
          ...(await fetchFullBooking(customer).catch(() => customer)),
          archivedAt: new Date().toISOString(),
        }))
    );
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
    safeSetJson(ARCHIVES_KEY, [...selectedCustomers, ...archivedItems]);
    setSelectedBookingNumbers([]);
    alert("จัดเก็บข้อมูลที่เลือกเรียบร้อย");
  };

  const bulkMoveToTrash = async () => {
    if (selectedBookingNumbers.length === 0) return;

    const confirmed = window.confirm(
      `ต้องการย้ายใบจองที่เลือก ${selectedBookingNumbers.length} รายการไปถังขยะหรือไม่?`
    );
    if (!confirmed) return;

    const trashItems = safeGetArray(TRASH_KEY);
    const selectedSet = new Set(selectedBookingNumbers);
    const deletedAt = new Date();
    const selectedCustomers = await Promise.all(
      customers
        .filter((customer) => selectedSet.has(customer.bookingNumber))
        .map(async (customer) => ({
          ...(await fetchFullBooking(customer).catch(() => customer)),
          deletedFrom: "customers",
          deletedAt: deletedAt.toISOString(),
          deletedDate: deletedAt.toLocaleString("th-TH"),
        }))
    );
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
    safeSetJson(TRASH_KEY, [...selectedCustomers, ...trashItems]);
    const calendarResults = await Promise.all(
      selectedCustomers.map(syncTrashCalendarEvent)
    );
    const calendarError = calendarResults.find(Boolean);
    setSelectedBookingNumbers([]);
    alert(
      calendarError
        ? `ย้ายข้อมูลที่เลือกไปถังขยะเรียบร้อย แต่ซิงก์ Google Calendar ไม่สำเร็จ: ${calendarError}`
        : "ย้ายข้อมูลที่เลือกไปถังขยะเรียบร้อย"
    );
  };

  const openBooking = (customer) => {
    fetchFullBooking(customer)
      .catch(() => customer)
      .then((booking) => {
        safeSetJson(SELECTED_BOOKING_KEY, booking);
        safeSetJson(CURRENT_BOOKING_KEY, booking);
        router.push(ROUTES.bookingView, { scroll: false });
      });
  };

  const moveToArchive = async (customer) => {
    const confirmed = window.confirm(
      `ต้องการจัดเก็บใบจอง ${customer.bookingNumber || "นี้"} หรือไม่?`
    );

    if (!confirmed) return;

    const archivedItems = safeGetArray(ARCHIVES_KEY);
    const fullCustomer = await fetchFullBooking(customer).catch(() => customer);

    const updatedCustomers = customers.filter(
      (item) => item.bookingNumber !== customer.bookingNumber
    );

    const archiveRecord = {
      ...fullCustomer,
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
    safeSetJson(ARCHIVES_KEY, [archiveRecord, ...archivedItems]);

    alert("จัดเก็บข้อมูลเรียบร้อย");
  };

  const moveToTrash = async (customer) => {
    const confirmed = window.confirm(
      `ต้องการย้ายใบจอง ${customer.bookingNumber || "นี้"} ไปถังขยะหรือไม่?`
    );

    if (!confirmed) return;

    try {
      const savedTrash = safeGetArray(TRASH_KEY);
      const fullCustomer = await fetchFullBooking(customer).catch(() => customer);

      const trashItems = Array.isArray(savedTrash)
        ? savedTrash
        : [];

      const updatedCustomers = customers.filter(
        (item) => item.bookingNumber !== customer.bookingNumber
      );

      const deletedAt = new Date();
      const trashRecord = {
        ...fullCustomer,
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

      safeSetJson(TRASH_KEY, updatedTrash);
      syncCustomers(updatedCustomers);
      const calendarError = await syncTrashCalendarEvent(trashRecord);
      alert(
        calendarError
          ? `ย้ายข้อมูลไปถังขยะเรียบร้อย แต่ซิงก์ Google Calendar ไม่สำเร็จ: ${calendarError}`
          : "ย้ายข้อมูลไปถังขยะเรียบร้อย"
      );
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
        const fullCustomer = await fetchFullBooking(customer).catch(() => updatedCustomer);
        const bookingPayload = { ...fullCustomer, ...updatedCustomer };
        const { error } = await supabase
          .from("bookings")
          .update({
            job_status: newStatus,
            booking_data: getBookingData(bookingPayload),
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

  const updateCustomerSource = async (customer, source, detail) => {
    const response = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "customerSource",
        brandId: BRAND_ID,
        bookingId: customer.supabaseId || customer.bookingId || "",
        bookingNumber: customer.bookingNumber || "",
        customerSource: source,
        customerSourceDetail: detail,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(result.error || "บันทึกช่องทางที่ลูกค้ารู้จักเราไม่สำเร็จ");
    }

    const updatedCustomer = normalizeBookingRow(result.booking || {});
    const nextCustomers = customers.map((item) =>
      (customer.supabaseId && item.supabaseId === customer.supabaseId) ||
      item.bookingNumber === customer.bookingNumber
        ? {
            ...item,
            customerSource: updatedCustomer.customerSource || null,
            customerSourceDetail: updatedCustomer.customerSourceDetail || "",
          }
        : item
    );

    syncCustomers(nextCustomers);
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
      className={`${listStyles.page} min-h-screen overflow-x-hidden p-4 md:p-6 xl:p-8`}
      style={{ backgroundColor: "#FFFFFF", color: brandChrome.theme.text }}
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
              className="min-h-12 rounded-xl border bg-white px-4 py-2 font-semibold transition hover:bg-[#F7F7F7]"
              style={brandChrome.secondaryButton}
            >
              กลับหน้าสร้างใบจอง
            </button>

            <button
              type="button"
              onClick={() => goTo(ROUTES.dashboard)}
              className="min-h-12 rounded-xl px-4 py-2 font-semibold text-white transition"
              style={listChrome.primaryButton}
            >
              เมนูหลัก
            </button>
          </div>
        </div>

        <div
          className="mb-5 rounded-3xl border bg-white p-5 shadow-sm"
          style={{ borderColor: brandChrome.theme.border }}
        >
          <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="min-w-0 flex-1">
              <label htmlFor="customer-search" className="mb-2 block text-sm font-semibold text-zinc-700">
                ค้นหาข้อมูล
              </label>
              <input
                id="customer-search"
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleCount(BOOKING_LIST_PAGE_SIZE);
                }}
                placeholder="ค้นหาเลขที่จอง ชื่อลูกค้า เบอร์โทร ประเภทงาน หรือสถานะงาน"
                className="w-full rounded-2xl border border-zinc-300 bg-zinc-50 px-5 py-4 text-base outline-none transition focus:border-zinc-900 focus:bg-white"
              />
            </div>

            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div>
                <label htmlFor="event-date-filter" className="mb-2 block text-sm font-semibold text-zinc-700">
                  กรองวันที่งาน
                </label>
                <select
                  id="event-date-filter"
                  value={dateFilter}
                  onChange={(event) => changeDateFilter(event.target.value)}
                  className="min-h-12 w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700"
                >
                  {EVENT_DATE_FILTERS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-zinc-700">
                  เรียงตาม
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {CUSTOMER_SORT_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => changeSort(value)}
                      aria-pressed={sortBy === value}
                      className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                        sortBy === value
                          ? "text-white shadow-sm"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                      style={sortBy === value ? listChrome.activeControl : undefined}
                    >
                      {label} {sortBy === value ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  ))}
                </div>
              </div>

            <button
              type="button"
              onClick={() =>
                changeSort(sortBy)
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
                <span className="rounded-xl bg-[#F7F7F7] px-3 py-2 text-sm font-semibold text-[#000000]">
                  เลือกแล้ว {selectedBookingNumbers.length} รายการ
                </span>
                <button
                  type="button"
                  onClick={bulkMoveToArchive}
                  className="min-h-12 rounded-2xl bg-[#000000] px-4 py-3 text-sm font-semibold text-white hover:bg-[#222222]"
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

        <p className="mb-4 text-sm text-zinc-600" role="status" aria-live="polite">
          {isLoading ? "กำลังโหลดรายการใบจอง..." : `แสดง ${filteredCustomers.length} จาก ${matchedCustomers.length} รายการที่พบ`}
          {dateFilter !== "all" && " · นับรวมวันนี้ตามเวลา Asia/Bangkok"}
        </p>
        {listError && (
          <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {listError} — กรุณาโหลดหน้าใหม่เพื่อรับข้อมูลล่าสุด
          </p>
        )}

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
                  key={customer.supabaseId || customer.bookingNumber || index}
                  className={`relative rounded-2xl border bg-white p-4 shadow-sm ${
                    isSelected ? "border-[#000000] ring-2 ring-[#F7F7F7]" : "border-zinc-200"
                  }`}
                >
                  <CustomerSourceIndicator
                    customer={customer}
                    brandChrome={brandChrome}
                    onChange={updateCustomerSource}
                  />
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
                        className="mt-1 h-5 w-5 cursor-pointer accent-[#000000]"
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
                      {formatCustomerEventDate(customer.eventDate || customer.formattedEventDate)}
                    </p>
                    <p>
                      <span className="font-semibold text-zinc-500">วันที่สร้างใบจอง:</span>{" "}
                      {formatCustomerCreatedAt(customer.createdAt)}
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
                      className="min-h-11 rounded-xl bg-[#000000] px-3 py-2 text-sm font-semibold text-white hover:bg-[#222222]"
                    >
                      ดูใบจอง
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => moveToArchive(customer)}
                        className="min-h-11 rounded-xl bg-[#000000] px-3 py-2 text-sm font-semibold text-white hover:bg-[#222222]"
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

        <div className={`${listStyles.tableViewport} hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block`} role="table" aria-label="รายการใบจองทั้งหมด">
          <div className={listStyles.tableCanvas}>
            <div
              className={`${listStyles.gridRow} grid grid-cols-[44px_1fr_1fr_0.9fr_0.9fr_0.8fr_1fr_300px] gap-3 px-4 py-4 text-sm font-semibold text-white lg:gap-4 lg:px-5`}
              style={listChrome.tableHeader}
              role="row"
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  aria-label="เลือกใบจองทั้งหมดที่แสดง"
                  className="h-5 w-5 cursor-pointer accent-[#000000]"
                />
              </div>
              {CUSTOMER_SORT_OPTIONS.map(([value, label]) => (
                <div key={value} role="columnheader" aria-sort={sortBy === value ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                  <button
                    type="button"
                    onClick={() => changeSort(value)}
                    aria-label={`เรียงตาม${label} ${sortBy === value && sortDirection === "asc" ? "มากไปน้อย" : "น้อยไปมาก"}`}
                    className={`min-h-11 w-full rounded-lg px-2 py-2 text-left transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white ${sortBy === value ? "bg-white/20 ring-1 ring-white/50" : ""}`}
                  >
                    {label} <span aria-hidden="true">{sortBy === value ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span>
                  </button>
                </div>
              ))}
              <div className="text-center">จัดการ</div>
            </div>

            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer, index) => {
                const jobStatus =
                  customer.jobStatus || customer.status || "รอดำเนินการ";

                return (
                  <div
                    key={customer.supabaseId || customer.bookingNumber || index}
                    className={`${listStyles.gridRow} relative grid grid-cols-[44px_1fr_1fr_0.9fr_0.9fr_0.8fr_1fr_300px] items-center gap-3 border-t px-4 py-4 text-sm transition lg:gap-4 lg:px-5 ${
                      selectedBookingNumbers.includes(customer.bookingNumber)
                        ? "border-[#000000]/60 bg-[#F7F7F7]/45"
                        : "border-zinc-200"
                    }`}
                  >
                    <CustomerSourceIndicator
                      customer={customer}
                      brandChrome={brandChrome}
                      onChange={updateCustomerSource}
                    />
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
                        className="h-5 w-5 cursor-pointer accent-[#000000]"
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
                      {formatCustomerEventDate(customer.eventDate || customer.formattedEventDate)}
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

                    <div>{formatCustomerCreatedAt(customer.createdAt)}</div>

                    <div className="flex flex-nowrap items-center justify-center gap-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openBooking(customer)}
                        className="min-h-10 rounded-xl bg-[#000000] px-3 py-2 text-sm font-semibold text-white hover:bg-[#222222]"
                      >
                        ดูใบจอง
                      </button>

                      <button
                        type="button"
                        onClick={() => moveToArchive(customer)}
                        className="min-h-10 rounded-xl bg-[#000000] px-3 py-2 text-sm font-semibold text-white hover:bg-[#222222]"
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
        {hasMoreCustomers && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + BOOKING_LIST_PAGE_SIZE)}
              className="min-h-11 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              โหลดเพิ่ม
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

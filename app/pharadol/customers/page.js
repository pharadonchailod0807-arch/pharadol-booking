"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";
import { syncBookingGoogleCalendar } from "@/app/lib/googleCalendarClient";
import { safeGetArray, safeGetObject, safeSetJson } from "@/app/lib/safeStorage";

const BRAND_ID = "pharadol";
const CUSTOMERS_KEY = `${BRAND_ID}_customers`;
const SELECTED_BOOKING_KEY = `${BRAND_ID}_selectedBooking`;
const CURRENT_BOOKING_KEY = `${BRAND_ID}_currentBooking`;
const ARCHIVES_KEY = `${BRAND_ID}_archives`;
const TRASH_KEY = `${BRAND_ID}_trash`;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const BOOKING_LIST_PAGE_SIZE = 30;

const ROUTES = {
  booking: "/pharadol",
  bookingView: "/pharadol?view=customer",
  dashboard: "/pharadol/dashboard",
  archives: "/pharadol/archives",
  trash: "/pharadol/trash",
};

const isRecordObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

export default function CustomersPage() {
  const router = useRouter();
  const brandChrome = getBrandChromeStyles(BRAND_ID);

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
    };
  }, []);

  const normalizeBookingList = useCallback(
    (items) =>
      Array.isArray(items)
        ? items.filter(isRecordObject).map(normalizeBookingRow)
        : [],
    [normalizeBookingRow]
  );

  const fetchBookingListPage = useCallback(async (page = 0) => {
    const params = new URLSearchParams({
      mode: "list",
      brand: BRAND_ID,
      status: "active",
      page: String(page),
      pageSize: String(BOOKING_LIST_PAGE_SIZE),
    });
    const response = await fetch(`/api/bookings?${params.toString()}`, {
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(result.error || "โหลดข้อมูลลูกค้าไม่สำเร็จ");
    }

    return {
      bookings: normalizeBookingList(result.bookings),
      page: Number(result.page || 0),
      hasMore: Boolean(result.hasMore),
    };
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
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedBookingNumbers, setSelectedBookingNumbers] = useState([]);
  const [listPage, setListPage] = useState(0);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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
        const normalizedBrands = Array.isArray(currentUser?.brands)
          ? currentUser.brands.map((brand) =>
              brand === "pharadon" ? "pharadol" : brand
            )
          : [];
        const isAdmin = currentUser?.role === "ADMIN";
        const hasBrandAccess = normalizedBrands.includes("pharadol");
        const accountIsActive = currentUser?.active !== false;
        const brandIsCorrect =
          activeBrand === "pharadol" && (isAdmin || hasBrandAccess);
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
        console.error("Cannot verify Pharadol access", error);
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

    const loadCustomers = async () => {
      try {
        const result = await fetchBookingListPage(0);
        syncCustomers(result.bookings);
        setListPage(result.page);
        setHasMoreCustomers(result.hasMore);
      } catch (error) {
        console.error("Cannot load customer data", error);
        setCustomers(
          normalizeBookingList(safeGetArray(CUSTOMERS_KEY)).slice(
            0,
            BOOKING_LIST_PAGE_SIZE
          )
        );
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
  }, [fetchBookingListPage, isAuthorized, normalizeBookingList, syncCustomers]);

  const loadMoreCustomers = async () => {
    if (isLoadingMore || !hasMoreCustomers) return;

    setIsLoadingMore(true);
    try {
      const result = await fetchBookingListPage(listPage + 1);
      const nextCustomers = [
        ...customers,
        ...result.bookings.filter(
          (booking) =>
            !customers.some(
              (customer) => customer.bookingNumber === booking.bookingNumber
            )
        ),
      ];
      syncCustomers(nextCustomers);
      setListPage(result.page);
      setHasMoreCustomers(result.hasMore);
    } catch (error) {
      console.error("Cannot load more customers", error);
      alert(error?.message || "โหลดข้อมูลเพิ่มไม่สำเร็จ");
    } finally {
      setIsLoadingMore(false);
    }
  };

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
    .map((customer) => customer?.bookingNumber)
    .filter(Boolean);

  const allVisibleSelected =
    visibleBookingNumbers.length > 0 &&
    visibleBookingNumbers.every((bookingNumber) =>
      selectedBookingNumbers.includes(bookingNumber)
    );

  const toggleSelectAllVisible = () => {
    setSelectedBookingNumbers((current) => {
      if (allVisibleSelected) {
        return current.filter(
          (bookingNumber) => !visibleBookingNumbers.includes(bookingNumber)
        );
      }

      return [...new Set([...current, ...visibleBookingNumbers])];
    });
  };

  const toggleBookingSelection = (bookingNumber) => {
    if (!bookingNumber) return;

    setSelectedBookingNumbers((current) =>
      current.includes(bookingNumber)
        ? current.filter((value) => value !== bookingNumber)
        : [...current, bookingNumber]
    );
  };

  const moveSelectedToArchive = async () => {
    if (selectedBookingNumbers.length === 0) return;

    const confirmed = window.confirm(
      `ต้องการจัดเก็บใบจองที่เลือก ${selectedBookingNumbers.length} รายการหรือไม่?`
    );

    if (!confirmed) return;

    try {
      const savedArchives = safeGetArray(ARCHIVES_KEY);
      const currentCustomers = customers;
      const archiveItems = Array.isArray(savedArchives) ? savedArchives : [];
      const selectedSet = new Set(selectedBookingNumbers);
      const archivedAt = new Date().toISOString();
      const selectedCustomers = await Promise.all(
        currentCustomers
          .filter((customer) => selectedSet.has(customer.bookingNumber))
          .map(async (customer) => ({
            ...(await fetchFullBooking(customer).catch(() => customer)),
            archivedAt,
          }))
      );
      const updatedCustomers = currentCustomers.filter(
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
                booking_data: getBookingData(customer, { archivedAt }),
              })
              .eq("id", customer.supabaseId)
          )
      );
      const archiveError = archiveResults.find((result) => result.error)?.error;

      if (archiveError) {
        throw archiveError;
      }

      syncCustomers(updatedCustomers);
      safeSetJson(ARCHIVES_KEY, [...selectedCustomers, ...archiveItems]);
      setSelectedBookingNumbers([]);
      window.alert(`จัดเก็บข้อมูลแล้ว ${selectedCustomers.length} รายการ`);
    } catch (error) {
      console.error("Cannot archive selected bookings", error);
      window.alert("ไม่สามารถจัดเก็บรายการที่เลือกได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const moveSelectedToTrash = async () => {
    if (selectedBookingNumbers.length === 0) return;

    const confirmed = window.confirm(
      `ต้องการย้ายใบจองที่เลือก ${selectedBookingNumbers.length} รายการไปถังขยะหรือไม่?`
    );

    if (!confirmed) return;

    try {
      const savedTrash = safeGetArray(TRASH_KEY);
      const currentCustomers = customers;
      const trashItems = Array.isArray(savedTrash) ? savedTrash : [];
      const selectedSet = new Set(selectedBookingNumbers);
      const deletedAt = new Date();
      const selectedCustomers = await Promise.all(
        currentCustomers
          .filter((customer) => selectedSet.has(customer.bookingNumber))
          .map(async (customer) => ({
            ...(await fetchFullBooking(customer).catch(() => customer)),
            deletedFrom: "customers",
            deletedAt: deletedAt.toISOString(),
            deletedDate: deletedAt.toLocaleString("th-TH"),
          }))
      );
      const updatedCustomers = currentCustomers.filter(
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
                  deletedAt: deletedAt.toISOString(),
                  deletedDate: deletedAt.toLocaleString("th-TH"),
                }),
              })
              .eq("id", customer.supabaseId)
          )
      );
      const trashError = trashResults.find((result) => result.error)?.error;

      if (trashError) {
        throw trashError;
      }

      syncCustomers(updatedCustomers);
      safeSetJson(TRASH_KEY, [...selectedCustomers, ...trashItems]);
      const calendarResults = await Promise.all(
        selectedCustomers.map(syncTrashCalendarEvent)
      );
      const calendarError = calendarResults.find(Boolean);
      setSelectedBookingNumbers([]);
      window.alert(
        calendarError
          ? `ย้ายไปถังขยะแล้ว ${selectedCustomers.length} รายการ แต่ซิงก์ Google Calendar ไม่สำเร็จ: ${calendarError}`
          : `ย้ายไปถังขยะแล้ว ${selectedCustomers.length} รายการ`
      );
    } catch (error) {
      console.error("Cannot trash selected bookings", error);
      window.alert("ไม่สามารถย้ายรายการที่เลือกไปถังขยะได้ กรุณาลองใหม่อีกครั้ง");
    }
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

  const getStatusClassName = (status) => {
    const normalizedStatus = String(status || "").trim();

    if (["เสร็จสิ้น", "ส่งมอบแล้ว", "ปิดงานแล้ว"].includes(normalizedStatus)) {
      return "bg-emerald-100 text-emerald-700";
    }

    if (["กำลังดำเนินการ", "กำลังถ่ายทำ", "กำลังตัดต่อ"].includes(normalizedStatus)) {
      return "bg-blue-100 text-blue-700";
    }

    if (["ยกเลิก", "ยกเลิกงาน"].includes(normalizedStatus)) {
      return "bg-red-100 text-red-700";
    }

    return "bg-amber-100 text-amber-700";
  };

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-4 md:p-6 xl:p-8">
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
              className="min-h-12 rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold text-zinc-700"
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

        <div className="mb-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
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

              {selectedBookingNumbers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 sm:ml-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBookingNumbers([])}
                    className="h-12 whitespace-nowrap rounded-2xl px-5 text-sm font-semibold text-white transition"
                    style={brandChrome.primaryButton}
                  >
                    ยกเลิกเลือกทั้งหมด
                  </button>

                  <div className="flex h-12 items-center rounded-2xl bg-blue-50 px-4 text-sm font-semibold text-blue-700">
                    เลือกแล้ว {selectedBookingNumbers.length} รายการ
                  </div>

                  <button
                    type="button"
                    onClick={moveSelectedToArchive}
                    className="h-12 whitespace-nowrap rounded-2xl bg-amber-500 px-5 text-sm font-semibold text-white transition hover:bg-amber-600"
                  >
                    จัดเก็บ
                  </button>

                  <button
                    type="button"
                    onClick={moveSelectedToTrash}
                    className="h-12 whitespace-nowrap rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    ถังขยะ
                  </button>
                </div>
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
                    isSelected ? "border-blue-300 ring-2 ring-blue-100" : "border-zinc-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() =>
                          toggleBookingSelection(customer.bookingNumber)
                        }
                        aria-label={`เลือกใบจอง ${customer.bookingNumber || ""}`}
                        className="mt-1 h-5 w-5 cursor-pointer accent-black"
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
                      className="min-h-11 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      ดูใบจอง
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => moveToArchive(customer)}
                        className="min-h-11 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                      >
                        จัดเก็บ
                      </button>
                      <button
                        type="button"
                        onClick={() => moveToTrash(customer)}
                        className="min-h-11 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
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

        <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
          <div className="min-w-[980px] lg:min-w-[1250px]">
            <div
              className="grid grid-cols-[48px_1.1fr_1fr_1fr_1fr_0.9fr_360px] gap-3 px-4 py-4 text-sm font-semibold text-white lg:grid-cols-[56px_1.1fr_1fr_1fr_1fr_0.9fr_430px] lg:gap-4 lg:px-5"
              style={brandChrome.tableHeader}
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  aria-label="เลือกใบจองทั้งหมดที่แสดง"
                  className="h-4 w-4 cursor-pointer accent-black"
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
                    className={`grid grid-cols-[48px_1.1fr_1fr_1fr_1fr_0.9fr_360px] items-center gap-3 border-t px-4 py-4 text-sm transition lg:grid-cols-[56px_1.1fr_1fr_1fr_1fr_0.9fr_430px] lg:gap-4 lg:px-5 lg:text-base ${
                      selectedBookingNumbers.includes(customer.bookingNumber)
                        ? "border-blue-200 bg-blue-50/70"
                        : "border-zinc-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedBookingNumbers.includes(
                          customer.bookingNumber
                        )}
                        onChange={() =>
                          toggleBookingSelection(customer.bookingNumber)
                        }
                        aria-label={`เลือกใบจอง ${customer.bookingNumber || ""}`}
                        className="h-4 w-4 cursor-pointer accent-black"
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

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openBooking(customer)}
                        className="min-h-10 rounded-xl bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700"
                      >
                        ดูใบจอง
                      </button>

                      <button
                        type="button"
                        onClick={() => moveToArchive(customer)}
                        className="min-h-10 rounded-xl bg-amber-500 px-3 py-2 font-semibold text-white hover:bg-amber-600"
                      >
                        จัดเก็บ
                      </button>

                      <button
                        type="button"
                        onClick={() => moveToTrash(customer)}
                        className="min-h-10 rounded-xl bg-red-600 px-3 py-2 font-semibold text-white hover:bg-red-700"
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
              onClick={loadMoreCustomers}
              disabled={isLoadingMore}
              className="min-h-11 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              {isLoadingMore ? "กำลังโหลด..." : "โหลดเพิ่ม"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

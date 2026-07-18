"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  applyGoogleCalendarSyncResult,
  getGoogleCalendarSyncStatus,
  markGoogleCalendarSyncError,
  shouldSyncBookingGoogleCalendar,
  syncBookingGoogleCalendar,
} from "@/app/lib/googleCalendarClient";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const WEEK_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const BRAND_CONFIG = {
  pharadol: {
    name: "PHARADOL PRODUCTION",
    dashboardPath: "/pharadol/dashboard",
    bookingPath: "/pharadol?view=customer",
  },
  adisorn: {
    name: "Adisorn Wedding Studio",
    dashboardPath: "/adisorn/dashboard",
    bookingPath: "/adisorn?view=customer",
  },
};
const CALENDAR_PALETTES = {
  pharadol: {
    primary: "#0F3D31",
    primaryDark: "#082E25",
    primaryHover: "#123F33",
    accent: "#CDAE77",
    accentDark: "#B88A2E",
    accentSoft: "#F6EFD7",
    background: "#F8FAFC",
    card: "#FFFFFF",
    dayBackground: "#FFFFFF",
    text: "#10231C",
    muted: "#68766F",
    border: "rgba(15, 23, 42, 0.08)",
    softBorder: "rgba(205, 174, 119, 0.34)",
    shadow: "0 14px 36px rgba(15, 23, 42, 0.07)",
  },
  adisorn: {
    primary: "#4A2E22",
    primaryDark: "#2B1A14",
    primaryHover: "#5A3828",
    accent: "#C9A46A",
    accentDark: "#B88A55",
    accentSoft: "#F3E6CF",
    background: "#F8FAFC",
    card: "#FFFFFF",
    dayBackground: "#FFFFFF",
    text: "#2B211B",
    muted: "#7A6A5D",
    border: "rgba(15, 23, 42, 0.08)",
    softBorder: "rgba(201, 164, 106, 0.34)",
    shadow: "0 14px 36px rgba(15, 23, 42, 0.07)",
  },
};

const CALENDAR_SURFACE = {
  card: "#FFFFFF",
  page: "#F8FAFC",
  weekday: "#F8FAFC",
  grid: "rgba(15, 23, 42, 0.08)",
  outside: "#F8FAFC",
  sunday: "#FFFAFA",
  eventDay: "#EFF6FF",
  eventDayBorder: "#BFDBFE",
  selected: "#2563EB",
  event: "#2563EB",
  eventHover: "#1D4ED8",
  eventShadow: "rgba(37, 99, 235, 0.18)",
  sundayText: "#DC2626",
  slateText: "#0F172A",
  mutedSlate: "#94A3B8",
};

const readArray = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const parseLocalDate = (value) => {
  if (!value) return null;

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);

  if (year && month && day) return new Date(year, month - 1, day);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isSameDay = (a, b) =>
  a &&
  b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getDateKey = (date) =>
  date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`
    : "";

const normalizeBookingRow = (row, brandId) => {
  const bookingData = row?.booking_data || {};

  return {
    ...bookingData,
    supabaseId: row.id,
    brandId: bookingData.brandId || brandId,
    bookingNumber: bookingData.bookingNumber || row.booking_number || "",
    customerName: bookingData.customerName || row.customer_name || "",
    phone: bookingData.phone || row.phone || "",
    email: bookingData.email || row.email || "",
    service: bookingData.service || row.service || "",
    location: bookingData.location || row.location || "",
    eventDate: bookingData.eventDate || row.event_date || "",
    startTime: bookingData.startTime || "",
    endTime: bookingData.endTime || "",
    jobStatus: row.job_status || bookingData.jobStatus || "รอยืนยัน",
  };
};

const formatThaiMonth = (date) =>
  date.toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });

const buildCalendarCells = (visibleDate) => {
  const year = visibleDate.getFullYear();
  const month = visibleDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const getCalendarEventTone = (event) => {
  const syncStatus = getGoogleCalendarSyncStatus(event);
  const statusText = [
    event?.jobStatus,
    event?.status,
    event?.googleCalendarSyncStatus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    event?.deleted ||
    statusText.includes("trash") ||
    statusText.includes("cancel") ||
    statusText.includes("ยกเลิก") ||
    statusText.includes("ถังขยะ")
  ) {
    return {
      background: "#9CA3AF",
      text: "#FFFFFF",
      shadow: "rgba(107, 114, 128, 0.16)",
    };
  }

  if (syncStatus === "ซิงก์แล้ว") {
    return {
      background: CALENDAR_SURFACE.event,
      text: "#FFFFFF",
      shadow: CALENDAR_SURFACE.eventShadow,
    };
  }

  if (syncStatus === "ซิงก์ไม่สำเร็จ") {
    return {
      background: "#EF4444",
      text: "#FFFFFF",
      shadow: "rgba(239, 68, 68, 0.18)",
    };
  }

  return {
    background: CALENDAR_SURFACE.event,
    text: "#FFFFFF",
    shadow: CALENDAR_SURFACE.eventShadow,
  };
};

const getCalendarSyncBadgeClass = (booking) => {
  const status = getGoogleCalendarSyncStatus(booking);

  if (status === "ซิงก์แล้ว") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "ซิงก์ไม่สำเร็จ") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-600";
};

export default function BrandCalendarPage({ brandId }) {
  const router = useRouter();
  const brand = BRAND_CONFIG[brandId];
  const palette = CALENDAR_PALETTES[brandId] || CALENDAR_PALETTES.pharadol;
  const customersKey = `${brandId}_customers`;
  const selectedBookingKey = `${brandId}_selectedBooking`;
  const currentBookingKey = `${brandId}_currentBooking`;
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [visibleDate, setVisibleDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loadMessage, setLoadMessage] = useState("");
  const [isRefreshingBookings, setIsRefreshingBookings] = useState(false);
  const [calendarSyncMessage, setCalendarSyncMessage] = useState("");
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [syncingBookingNumber, setSyncingBookingNumber] = useState("");

  const loadBookings = useCallback(async ({ manual = false } = {}) => {
    if (manual) setIsRefreshingBookings(true);

    const localBookings = readArray(customersKey).filter((item) => item.eventDate);
    setBookings(localBookings);
    setLoadMessage(
      localBookings.length > 0
        ? "ใช้ข้อมูลล่าสุดที่บันทึกไว้ในเครื่อง"
        : "กำลังโหลดข้อมูล"
    );

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("deleted", false)
        .order("event_date", { ascending: true });

      if (error) throw error;

      const remoteBookings = (Array.isArray(data) ? data : [])
        .map((row) => normalizeBookingRow(row, brandId))
        .filter((item) => item.brandId === brandId && item.eventDate);

      if (remoteBookings.length > 0) {
        setBookings(remoteBookings);
        localStorage.setItem(customersKey, JSON.stringify(remoteBookings));
        setLoadMessage("ดึงข้อมูลจากฐานข้อมูลแล้ว");
        setIsRefreshingBookings(false);
        return;
      }

      setLoadMessage("ยังไม่พบข้อมูลจากฐานข้อมูล ใช้ข้อมูลในเครื่อง");
    } catch (error) {
      console.error("Cannot load calendar bookings", error);
      setLoadMessage("โหลดฐานข้อมูลไม่ได้ ใช้ข้อมูลในเครื่องแทน");
    }

    setIsRefreshingBookings(false);
  }, [brandId, customersKey]);

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const normalizedBrands = Array.isArray(currentUser?.brands)
          ? currentUser.brands.map((item) =>
              item === "pharadon" ? "pharadol" : item
            )
          : [];
        const isAdmin = currentUser?.role === "ADMIN";
        const hasBrandAccess = normalizedBrands.includes(brandId);
        const accountIsActive = currentUser?.active !== false;
        const brandIsCorrect =
          activeBrand === brandId && (isAdmin || hasBrandAccess);
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
      } catch {
        sessionStorage.clear();
        window.location.replace("/login");
        return false;
      }
    };

    if (!verifyAccess()) return;

    return undefined;
  }, [brandId]);

  useEffect(() => {
    if (!isAuthorized) return;

    const timer = window.setTimeout(() => {
      loadBookings();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isAuthorized, loadBookings]);

  const events = useMemo(
    () =>
      bookings
        .map((booking) => ({
          ...booking,
          date: parseLocalDate(booking.eventDate),
        }))
        .filter((booking) => booking.date)
        .sort((a, b) => {
          const dateDiff = a.date.getTime() - b.date.getTime();
          if (dateDiff !== 0) return dateDiff;
          return String(a.startTime || "").localeCompare(String(b.startTime || ""));
        }),
    [bookings]
  );

  const calendarCells = useMemo(() => buildCalendarCells(visibleDate), [visibleDate]);
  const eventsByDate = useMemo(() => {
    const groupedEvents = new Map();

    events.forEach((event) => {
      const key = getDateKey(event.date);
      if (!key) return;
      const currentEvents = groupedEvents.get(key) || [];
      currentEvents.push(event);
      groupedEvents.set(key, currentEvents);
    });

    return groupedEvents;
  }, [events]);
  const selectedEvents = useMemo(
    () => eventsByDate.get(getDateKey(selectedDate)) || [],
    [eventsByDate, selectedDate]
  );
  const monthEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.date.getFullYear() === visibleDate.getFullYear() &&
          event.date.getMonth() === visibleDate.getMonth()
      ),
    [events, visibleDate]
  );
  const calendarSyncSummary = useMemo(
    () =>
      events.reduce(
        (summary, event) => {
          const status = getGoogleCalendarSyncStatus(event);

          if (status === "ซิงก์แล้ว") summary.synced += 1;
          else if (status === "ซิงก์ไม่สำเร็จ") summary.failed += 1;
          else summary.pending += 1;

          return summary;
        },
        { synced: 0, pending: 0, failed: 0 }
      ),
    [events]
  );
  const selectedDateLabel = selectedDate.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const syncStatusHeadline =
    calendarSyncSummary.failed > 0
      ? "มีงานซิงก์ไม่สำเร็จ"
      : calendarSyncSummary.pending > 0
        ? "มีงานรอซิงก์"
        : "ซิงก์เรียบร้อย";
  const summaryCards = [
    {
      label: "Google Calendar Sync",
      value: syncStatusHeadline,
      detail: `ซิงก์แล้ว ${calendarSyncSummary.synced} งาน / ยังไม่ซิงก์ ${calendarSyncSummary.pending} งาน`,
      icon: "G",
      tone: calendarSyncSummary.failed > 0 ? "#DC2626" : palette.primary,
      soft: calendarSyncSummary.failed > 0 ? "#FEF2F2" : palette.accentSoft,
    },
    {
      label: "งานทั้งหมดในเดือนนี้",
      value: monthEvents.length,
      detail: `${formatThaiMonth(visibleDate)}`,
      icon: "M",
      tone: palette.primary,
      soft: palette.accentSoft,
    },
    {
      label: "ซิงก์แล้ว",
      value: calendarSyncSummary.synced,
      detail: "พร้อมใน Google Calendar",
      icon: "S",
      tone: "#047857",
      soft: "#ECFDF5",
    },
    {
      label: "ยังไม่ซิงก์",
      value: calendarSyncSummary.pending,
      detail: "รอส่งข้อมูลขึ้น Calendar",
      icon: "P",
      tone: palette.accentDark,
      soft: "#FFFBEB",
    },
    {
      label: "ซิงก์ไม่สำเร็จ",
      value: calendarSyncSummary.failed,
      detail: "ต้องลองซิงก์อีกครั้ง",
      icon: "!",
      tone: "#B91C1C",
      soft: "#FEF2F2",
    },
  ];

  const goToMonth = (amount) => {
    setVisibleDate((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + amount, 1);
      return next;
    });
  };

  const goToday = () => {
    const today = new Date();
    setVisibleDate(today);
    setSelectedDate(today);
  };

  const openBooking = (booking) => {
    localStorage.setItem(selectedBookingKey, JSON.stringify(booking));
    localStorage.setItem(currentBookingKey, JSON.stringify(booking));
    router.push(brand.bookingPath, { scroll: false });
  };

  const openNewBooking = () => {
    router.push(`/${brandId}`, { scroll: false });
  };

  const persistCalendarSyncBooking = async (booking) => {
    const storedBookings = readArray(customersKey);
    const sourceBookings = storedBookings.length > 0 ? storedBookings : bookings;
    const updatedBookings = sourceBookings.map((item) =>
      item.bookingNumber === booking.bookingNumber ? booking : item
    );

    setBookings(updatedBookings);
    localStorage.setItem(customersKey, JSON.stringify(updatedBookings));

    const updateQuery = supabase
      .from("bookings")
      .update({ booking_data: booking });

    if (booking.supabaseId) {
      await updateQuery.eq("id", booking.supabaseId);
      return;
    }

    await updateQuery.eq("booking_number", booking.bookingNumber);
  };

  const syncCalendarBooking = async (booking, { silent = false } = {}) => {
    if (!booking?.bookingNumber) return null;

    setSyncingBookingNumber(booking.bookingNumber);
    if (!silent) setCalendarSyncMessage("กำลังซิงก์ Google Calendar...");

    try {
      const result = await syncBookingGoogleCalendar({
        brand: brandId,
        booking,
      });
      const syncedBooking = applyGoogleCalendarSyncResult(booking, result);

      await persistCalendarSyncBooking(syncedBooking);
      if (!silent) setCalendarSyncMessage("ซิงก์ Google Calendar สำเร็จ");

      return syncedBooking;
    } catch (error) {
      const message = error?.message || "ซิงก์ Google Calendar ไม่สำเร็จ";
      const failedBooking = markGoogleCalendarSyncError(booking, message);

      await persistCalendarSyncBooking(failedBooking);
      if (!silent) {
        setCalendarSyncMessage(`ซิงก์ Google Calendar ไม่สำเร็จ: ${message}`);
      }

      return failedBooking;
    } finally {
      setSyncingBookingNumber("");
    }
  };

  const syncVisibleCalendarBookings = async () => {
    if (isSyncingCalendar) return;

    const itemsToSync = events.filter(
      (event) =>
        event.eventDate &&
        event.bookingNumber &&
        shouldSyncBookingGoogleCalendar(event)
    );

    if (itemsToSync.length === 0) {
      setCalendarSyncMessage("ไม่มีงานที่ต้องซิงก์ Google Calendar เพิ่มเติม");
      return;
    }

    setIsSyncingCalendar(true);
    setCalendarSyncMessage("กำลังซิงก์ Google Calendar...");

    let successCount = 0;
    let failedCount = 0;

    try {
      for (const booking of itemsToSync) {
        const syncedBooking = await syncCalendarBooking(booking, { silent: true });

        if (
          syncedBooking?.googleCalendarSyncStatus === "failed" ||
          syncedBooking?.googleCalendarSyncStatus === "error"
        ) {
          failedCount += 1;
        } else {
          successCount += 1;
        }
      }

      setCalendarSyncMessage(
        failedCount > 0
          ? `ซิงก์สำเร็จ ${successCount} งาน, ไม่สำเร็จ ${failedCount} งาน`
          : `ซิงก์ Google Calendar สำเร็จ ${successCount} งาน`
      );
    } finally {
      setIsSyncingCalendar(false);
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
      className="min-h-screen overflow-x-hidden p-2 sm:p-3 md:p-4"
      style={{
        background: `linear-gradient(180deg, ${palette.background} 0%, #FFFFFF 100%)`,
        color: palette.text,
      }}
    >
      <div className="mx-auto max-w-[1500px]">
        <header
          className="rounded-[20px] border bg-white p-4 shadow-sm transition md:rounded-[24px] md:p-5"
          style={{
            borderColor: palette.border,
            boxShadow: palette.shadow,
          }}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div
                className="mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
                style={{
                  borderColor: palette.softBorder,
                  backgroundColor: palette.accentSoft,
                  color: palette.primary,
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.accent }} />
                {brand.name}
              </div>
              <h1 className="text-2xl font-black leading-tight sm:text-3xl">
                ปฏิทินงาน
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm font-medium" style={{ color: palette.muted }}>
                จัดตารางงานจากใบจองในระบบ พร้อมสถานะซิงก์ Google Calendar โดยใช้ข้อมูลเดิมเป็นหลัก
              </p>
              <p className="mt-1 text-xs font-semibold sm:text-sm" style={{ color: palette.muted }}>
                {loadMessage || "กำลังโหลดข้อมูลปฏิทิน"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => router.push(brand.dashboardPath)}
                className="min-h-[44px] rounded-2xl border bg-white px-4 text-sm font-black transition hover:-translate-y-0.5 hover:bg-white/80 disabled:opacity-50 sm:px-5"
                style={{ borderColor: palette.border, color: palette.text }}
              >
                กลับเมนูหลัก
              </button>
              <button
                type="button"
                onClick={() => loadBookings({ manual: true })}
                disabled={isRefreshingBookings}
                className="min-h-[44px] rounded-2xl border bg-white px-4 text-sm font-black transition hover:-translate-y-0.5 hover:bg-white/80 disabled:opacity-50 sm:px-5"
                style={{ borderColor: palette.border, color: palette.text }}
              >
                {isRefreshingBookings ? "กำลังรีเฟรช" : "รีเฟรช"}
              </button>
              <button
                type="button"
                onClick={syncVisibleCalendarBookings}
                disabled={isSyncingCalendar}
                className="min-h-[44px] rounded-2xl px-4 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50 sm:px-5"
                style={{ backgroundColor: palette.primaryDark || palette.primary }}
              >
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px]">
                  G
                </span>
                {isSyncingCalendar ? "กำลังซิงก์" : "ซิงก์ Google Calendar"}
              </button>
            </div>
          </div>
        </header>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => (
            <article
              key={card.label}
              className="group rounded-[18px] border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ borderColor: palette.border }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-black uppercase tracking-[0.08em]" style={{ color: palette.muted }}>
                    {card.label}
                  </p>
                  <p className="mt-1.5 truncate text-xl font-black" style={{ color: palette.text }}>
                    {card.value}
                  </p>
                </div>
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black"
                  style={{ backgroundColor: card.soft, color: card.tone }}
                >
                  {card.icon}
                </span>
              </div>
              <p className="mt-2 min-h-8 text-xs font-semibold leading-relaxed" style={{ color: palette.muted }}>
                {card.detail}
              </p>
              {card.label === "Google Calendar Sync" && calendarSyncMessage && (
                <p className="mt-2 text-xs font-bold" style={{ color: calendarSyncSummary.failed > 0 ? "#B91C1C" : palette.primary }}>
                  {calendarSyncMessage}
                </p>
              )}
            </article>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <section
            className="overflow-hidden rounded-[22px] border bg-white shadow-sm md:rounded-[24px] lg:max-h-[calc(100vh-238px)]"
            style={{
              borderColor: palette.border,
              boxShadow: palette.shadow,
            }}
          >
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-b p-3.5 md:p-4"
              style={{ borderColor: palette.border }}
            >
              <div className="min-w-0">
                <h2 className="text-xl font-black md:text-2xl">
                  {formatThaiMonth(visibleDate)}
                </h2>
                <p className="mt-0.5 text-xs font-semibold md:text-sm" style={{ color: palette.muted }}>
                  มุมมองรายเดือนของงานทั้งหมดในระบบ
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                <span
                  className="hidden min-h-[34px] items-center rounded-full border px-3 text-xs font-black md:inline-flex"
                  style={{
                    borderColor: palette.softBorder,
                    backgroundColor: palette.accentSoft,
                    color: palette.primary,
                  }}
                >
                  {monthEvents.length} งานในเดือนนี้
                </span>
                <button
                  type="button"
                  onClick={() => goToMonth(-1)}
                  className="min-h-[40px] rounded-[14px] border bg-white px-3 text-xs font-black transition hover:-translate-y-0.5 sm:px-4"
                  style={{ borderColor: palette.border, color: palette.text }}
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="min-h-[40px] rounded-[14px] px-4 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5"
                  style={{ backgroundColor: palette.primary }}
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => goToMonth(1)}
                  className="min-h-[40px] rounded-[14px] border bg-white px-3 text-xs font-black transition hover:-translate-y-0.5 sm:px-4"
                  style={{ borderColor: palette.border, color: palette.text }}
                >
                  ถัดไป
                </button>
              </div>
            </div>

            <div className="w-full overflow-x-hidden">
              <div
                className="grid grid-cols-7 border-b text-center text-[11px] font-black md:text-xs"
                style={{
                  borderColor: CALENDAR_SURFACE.grid,
                  backgroundColor: CALENDAR_SURFACE.weekday,
                  color: CALENDAR_SURFACE.slateText,
                }}
              >
                {WEEK_DAYS.map((day, index) => (
                  <div
                    key={day}
                    className="py-2 md:py-2.5"
                    style={{ color: index === 0 ? CALENDAR_SURFACE.sundayText : undefined }}
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px" style={{ backgroundColor: CALENDAR_SURFACE.grid }}>
                {calendarCells.map((date) => {
                  const dayEvents = eventsByDate.get(getDateKey(date)) || [];
                  const isCurrentMonth = date.getMonth() === visibleDate.getMonth();
                  const isSelected = isSameDay(date, selectedDate);
                  const isToday = isSameDay(date, new Date());
                  const isSunday = date.getDay() === 0;
                  const hasEvents = dayEvents.length > 0;
                  const visibleDayEvents = dayEvents.slice(0, 1);
                  const hiddenEventCount = Math.max(dayEvents.length - visibleDayEvents.length, 0);
                  const dayBackground = !isCurrentMonth
                    ? CALENDAR_SURFACE.outside
                    : isSelected
                      ? CALENDAR_SURFACE.card
                      : hasEvents
                        ? CALENDAR_SURFACE.eventDay
                        : isSunday
                          ? CALENDAR_SURFACE.sunday
                          : CALENDAR_SURFACE.card;

                  return (
                    <div
                      key={date.toISOString()}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDate(date)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDate(date);
                        }
                      }}
                      className={`group min-h-[68px] min-w-0 cursor-pointer overflow-hidden p-1.5 text-left transition duration-200 hover:z-10 hover:-translate-y-0.5 hover:shadow-md sm:min-h-[76px] sm:p-2 md:h-[88px] md:p-2 lg:h-[clamp(62px,7.2vh,96px)] lg:min-h-[62px] ${
                        isCurrentMonth ? "" : "opacity-30"
                      }`}
                      style={{
                        backgroundColor: dayBackground,
                        boxShadow: isSelected
                          ? `inset 0 0 0 2px ${CALENDAR_SURFACE.selected}`
                          : hasEvents && isCurrentMonth
                            ? `inset 0 0 0 1px ${CALENDAR_SURFACE.eventDayBorder}`
                          : "none",
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1 md:mb-1.5">
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-black md:h-7 md:w-7 md:text-xs"
                          style={{
                            backgroundColor: isToday ? palette.primary : "#FFFFFF",
                            color: isToday || isSelected ? "#FFFFFF" : palette.text,
                            border: isToday
                              ? `1px solid ${palette.primary}`
                              : isSunday
                                ? "1px solid #FECACA"
                                : `1px solid ${CALENDAR_SURFACE.grid}`,
                            ...(isSelected && !isToday
                              ? {
                                  backgroundColor: CALENDAR_SURFACE.selected,
                                  borderColor: CALENDAR_SURFACE.selected,
                                }
                              : {}),
                            ...(!isToday && !isSelected && isSunday
                              ? { color: CALENDAR_SURFACE.sundayText }
                              : {}),
                            ...(!isCurrentMonth && !isToday && !isSelected
                              ? { color: CALENDAR_SURFACE.mutedSlate }
                              : {}),
                          }}
                        >
                          {date.getDate()}
                        </span>
                        {dayEvents.length > 1 && (
                          <span
                            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[10px] font-black shadow-sm"
                            style={{
                              backgroundColor: CALENDAR_SURFACE.event,
                              color: "#FFFFFF",
                            }}
                          >
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        {hasEvents && (
                          <div className="grid gap-1 sm:hidden">
                            {dayEvents.slice(0, 1).map((event) => {
                              const tone = getCalendarEventTone(event);

                              return (
                                <div
                                  key={`${event.bookingNumber}-${event.startTime}-${event.customerName}-mobile`}
                                  className="flex min-w-0 items-center gap-1.5"
                                  title={`${event.startTime || "ทั้งวัน"} ${event.customerName || event.service || "งาน"}`}
                                >
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: tone.background }}
                                  />
                                  <span className="min-w-0 truncate text-[10px] font-black" style={{ color: CALENDAR_SURFACE.slateText }}>
                                    {event.startTime || "ทั้งวัน"}
                                  </span>
                                </div>
                              );
                            })}
                            {dayEvents.length > 1 && (
                              <span
                                className="text-[10px] font-black"
                                style={{ color: palette.primary }}
                              >
                                +{dayEvents.length - 1}
                              </span>
                            )}
                          </div>
                        )}
                        {visibleDayEvents.map((event) => {
                          const tone = getCalendarEventTone(event);
                          const eventTitle = `${event.startTime || "ทั้งวัน"} ${event.customerName || event.service || "งาน"} ${event.bookingNumber || ""}`.trim();
                          const eventLabel = `${event.startTime || "ทั้งวัน"} ${event.customerName || event.service || "งาน"}`;

                          return (
                            <div
                              key={`${event.bookingNumber}-${event.startTime}-${event.customerName}`}
                              className="hidden h-[28px] min-w-0 transform-gpu items-center overflow-hidden rounded-[10px] px-2 text-[11px] font-black leading-none shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:flex md:text-[11px]"
                              style={{
                                backgroundColor: tone.background,
                                color: tone.text,
                                boxShadow: `0 6px 14px ${tone.shadow}`,
                              }}
                              title={eventTitle}
                            >
                              <span className="min-w-0 truncate">{eventLabel}</span>
                            </div>
                          );
                        })}
                        {hiddenEventCount > 0 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedDate(date);
                            }}
                            className="hidden w-full rounded-full px-2 py-0.5 text-center text-[10px] font-black transition hover:-translate-y-0.5 sm:block"
                            style={{
                              backgroundColor: "#DBEAFE",
                              color: CALENDAR_SURFACE.event,
                            }}
                          >
                            + อีก {hiddenEventCount} งาน
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="flex flex-col gap-2 border-t px-3.5 py-2.5 text-xs font-bold sm:flex-row sm:items-center sm:justify-between md:px-4"
              style={{ borderColor: CALENDAR_SURFACE.grid, color: palette.muted }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CALENDAR_SURFACE.event }} />
                  งานในปฏิทิน
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CALENDAR_SURFACE.eventDay }} />
                  วันที่มีงาน
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  ซิงก์ไม่สำเร็จ
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CALENDAR_SURFACE.sundayText }} />
                  วันอาทิตย์
                </span>
              </div>
              <span className="text-[11px] font-black" style={{ color: palette.primary }}>
                คู่มือการใช้งาน: เลือกวันที่เพื่อดูรายละเอียดงานด้านขวา
              </span>
            </div>
          </section>

          <aside
            className="flex flex-col rounded-[22px] border bg-white p-4 shadow-sm md:rounded-[24px] md:p-4 lg:sticky lg:top-4 lg:h-[calc(100vh-238px)] lg:overflow-hidden"
            style={{
              borderColor: palette.border,
              boxShadow: palette.shadow,
            }}
          >
            <div className="mb-4 shrink-0">
              <p className="text-sm font-black" style={{ color: palette.muted }}>
                รายการวันที่เลือก
              </p>
              <h2 className="mt-1 text-xl font-black leading-tight md:text-2xl">
                {selectedDateLabel}
              </h2>
              <p className="mt-1.5 text-sm font-semibold" style={{ color: palette.muted }}>
                {selectedEvents.length} งานในวันนี้
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 lg:overflow-y-auto lg:pr-1">
              {selectedEvents.length > 0 ? (
                selectedEvents.map((event) => {
                  const eventSyncStatus = getGoogleCalendarSyncStatus(event);
                  const shouldShowRetry = eventSyncStatus !== "ซิงก์แล้ว";
                  const eventTone = getCalendarEventTone(event);
                  const eventTimeLabel = event.startTime
                    ? `${event.startTime} - ${event.endTime || "ไม่ระบุเวลาจบ"}`
                    : "ทั้งวัน";

                  return (
                    <article
                      key={`${event.bookingNumber}-${event.startTime}-${event.customerName}`}
                      className="rounded-[18px] border p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{
                        borderColor: eventSyncStatus === "ซิงก์ไม่สำเร็จ" ? "#FECACA" : CALENDAR_SURFACE.eventDayBorder,
                        backgroundColor: eventSyncStatus === "ซิงก์ไม่สำเร็จ" ? "#FEF2F2" : "#F8FBFF",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-base font-black leading-snug">
                            {event.customerName || "ไม่ระบุชื่อลูกค้า"}
                          </p>
                          <p className="mt-1 break-words text-sm font-semibold" style={{ color: palette.muted }}>
                            {event.bookingNumber || "-"} · {event.jobStatus || "รอยืนยัน"}
                          </p>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-black shadow-sm"
                          style={{
                            backgroundColor: eventTone.background,
                            color: eventTone.text,
                          }}
                        >
                          {eventTimeLabel}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1.5 text-sm font-semibold" style={{ color: palette.muted }}>
                        <p>เลขใบจอง: {event.bookingNumber || "-"}</p>
                        <p>เวลา: {eventTimeLabel}</p>
                        <p>ประเภทงาน: {event.service || "-"}</p>
                        <p className="break-words">สถานที่: {event.location || "-"}</p>
                        <p>โทร: {event.phone || "-"}</p>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${getCalendarSyncBadgeClass(event)}`}
                        >
                          {eventSyncStatus}
                        </span>
                        {event.googleCalendarSyncError && (
                          <span className="text-xs font-semibold text-red-600">
                            {event.googleCalendarSyncError}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => openBooking(event)}
                        className="mt-3 min-h-[40px] w-full rounded-[14px] px-4 font-black text-white shadow-sm transition hover:-translate-y-0.5"
                        style={{ backgroundColor: palette.primary }}
                      >
                        เปิดใบจอง
                      </button>
                      {shouldShowRetry && (
                        <button
                          type="button"
                          onClick={() => syncCalendarBooking(event)}
                          disabled={
                            isSyncingCalendar ||
                            syncingBookingNumber === event.bookingNumber
                          }
                          className="mt-2 min-h-[40px] w-full rounded-[14px] border bg-white px-4 font-black transition hover:-translate-y-0.5 hover:bg-white/80 disabled:opacity-50"
                          style={{ borderColor: palette.border, color: palette.text }}
                        >
                          {syncingBookingNumber === event.bookingNumber
                            ? "กำลังซิงก์..."
                            : "ซิงก์งานนี้อีกครั้ง"}
                        </button>
                      )}
                    </article>
                  );
                })
              ) : (
                <div
                  className="rounded-[18px] border p-6 text-center"
                  style={{
                    borderColor: CALENDAR_SURFACE.grid,
                    backgroundColor: CALENDAR_SURFACE.page,
                  }}
                >
                  <div
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black"
                    style={{
                      backgroundColor: CALENDAR_SURFACE.eventDay,
                      color: CALENDAR_SURFACE.event,
                    }}
                  >
                    31
                  </div>
                  <p className="mt-4 text-lg font-black">ไม่มีงานในวันนี้</p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: palette.muted }}>
                    เลือกวันที่อื่นหรือเพิ่มใบจองใหม่
                  </p>
                  <button
                    type="button"
                    onClick={openNewBooking}
                    className="mt-4 min-h-[40px] rounded-[14px] px-5 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5"
                    style={{ backgroundColor: palette.primary }}
                  >
                    เพิ่มใบจองใหม่
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

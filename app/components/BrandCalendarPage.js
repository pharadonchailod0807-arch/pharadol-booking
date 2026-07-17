"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const WEEK_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DEFAULT_EVENT_COLOR = "#111827";
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

const getEventColor = (event) => {
  const color = String(event?.calendarColor || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_EVENT_COLOR;
};

const getReadableTextColor = (backgroundColor) => {
  const hex = backgroundColor.replace("#", "");
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.62 ? "#111827" : "#ffffff";
};

export default function BrandCalendarPage({ brandId }) {
  const router = useRouter();
  const brand = BRAND_CONFIG[brandId];
  const brandChrome = getBrandChromeStyles(brandId);
  const isAdisorn = brandId === "adisorn";
  const customersKey = `${brandId}_customers`;
  const selectedBookingKey = `${brandId}_selectedBooking`;
  const currentBookingKey = `${brandId}_currentBooking`;
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [visibleDate, setVisibleDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loadMessage, setLoadMessage] = useState("");
  const [isRefreshingBookings, setIsRefreshingBookings] = useState(false);

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
  const selectedEvents = events.filter((event) => isSameDay(event.date, selectedDate));
  const monthEvents = events.filter(
    (event) =>
      event.date.getFullYear() === visibleDate.getFullYear() &&
      event.date.getMonth() === visibleDate.getMonth()
  );

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

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main
      className="min-h-screen overflow-x-hidden p-3 text-zinc-900 sm:p-4 md:p-6 xl:p-8"
      style={isAdisorn ? { backgroundColor: brandChrome.theme.background } : undefined}
    >
      <div className="mx-auto max-w-[1536px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-5">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold md:text-3xl">ปฏิทินงาน</h1>
            <p className="mt-1 text-sm text-zinc-500">
              แสดงงานจากใบจองของ {brand.name} ในรูปแบบปฏิทินจริง
            </p>
            <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
              {loadMessage} · Google Calendar จะต่อได้หลังเพิ่ม Calendar scope/token
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push(brand.dashboardPath)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white md:px-5 md:py-3 md:text-base ${
              isAdisorn ? "bg-[#4A2E22] hover:bg-[#5A3828]" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            กลับเมนูหลัก
          </button>
          <button
            type="button"
            onClick={() => loadBookings({ manual: true })}
            disabled={isRefreshingBookings}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 md:px-5 md:py-3 md:text-base"
          >
            {isRefreshingBookings ? "กำลังรีเฟรช" : "รีเฟรช"}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-zinc-200/70">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 p-3 md:p-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-500 md:text-sm">
                  {monthEvents.length} งานในเดือนนี้
                </p>
                <h2 className="mt-0.5 text-lg font-bold md:text-2xl">
                  {formatThaiMonth(visibleDate)}
                </h2>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => goToMonth(-1)}
                  className="min-h-9 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-zinc-100 sm:px-3 md:text-sm"
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="min-h-9 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition sm:px-3 md:text-sm"
                  style={brandChrome.primaryButton}
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => goToMonth(1)}
                  className="min-h-9 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-zinc-100 sm:px-3 md:text-sm"
                >
                  ถัดไป
                </button>
              </div>
            </div>

            <div className="w-full overflow-x-hidden">
              <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50 text-center text-[11px] font-semibold text-zinc-500 md:text-sm">
                {WEEK_DAYS.map((day) => (
                  <div key={day} className="py-2 md:py-3">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {calendarCells.map((date) => {
                  const dayEvents = events.filter((event) => isSameDay(event.date, date));
                  const isCurrentMonth = date.getMonth() === visibleDate.getMonth();
                  const isSelected = isSameDay(date, selectedDate);
                  const isToday = isSameDay(date, new Date());

                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`min-h-[72px] min-w-0 border-b border-r border-zinc-100 p-1 text-left transition sm:min-h-[88px] sm:p-1.5 md:min-h-[112px] md:p-2 xl:min-h-[120px] ${
                        isSelected
                          ? isAdisorn
                            ? "bg-[#F3E6CF]/55 ring-1 ring-inset ring-[#C9A46A]"
                            : "bg-blue-50 ring-1 ring-inset ring-blue-500"
                          : isAdisorn
                            ? "bg-white hover:bg-[#F3E6CF]/45"
                            : "bg-white hover:bg-blue-50"
                      } ${isCurrentMonth ? "" : "text-zinc-300"}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1 md:mb-2">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[13px] font-semibold md:h-7 md:w-7 md:text-sm ${
                            isToday
                              ? "text-white"
                              : isSelected
                                ? isAdisorn
                                  ? "text-white"
                                  : "bg-blue-600 text-white"
                                : "text-zinc-700"
                          }`}
                          style={isToday || (isAdisorn && isSelected) ? brandChrome.activeControl : undefined}
                        >
                          {date.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="hidden rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 sm:inline-flex">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-0.5 md:space-y-1">
                        {dayEvents.slice(0, 3).map((event) => {
                          const eventColor = getEventColor(event);
                          const textColor = getReadableTextColor(eventColor);

                          return (
                            <div
                              key={`${event.bookingNumber}-${event.startTime}-${event.customerName}`}
                            className="h-[17px] truncate rounded-md px-1 py-0.5 text-[10px] font-medium leading-[14px] md:h-[23px] md:px-2 md:py-1 md:text-xs md:leading-[15px]"
                              style={{
                                backgroundColor: eventColor,
                                color: textColor,
                              }}
                              title={`${event.startTime || "--:--"} ${event.customerName || event.service || "งาน"}`}
                            >
                              {event.startTime || "--:--"} {event.customerName || event.service || "งาน"}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <p className="truncate text-[10px] font-semibold text-zinc-400 md:text-xs">
                            +{dayEvents.length - 3} เพิ่มเติม
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-auto md:p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold text-zinc-500">
                รายการวันที่เลือก
              </p>
              <h2 className="mt-1 text-xl font-bold">
                {selectedDate.toLocaleDateString("th-TH", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>

            <div className="space-y-3">
              {selectedEvents.length > 0 ? (
                selectedEvents.map((event) => (
                  <article
                    key={`${event.bookingNumber}-${event.startTime}-${event.customerName}`}
                    className="rounded-2xl border border-zinc-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold">
                          {event.customerName || "ไม่ระบุชื่อลูกค้า"}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {event.bookingNumber || "-"} · {event.jobStatus || "รอยืนยัน"}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={{
                          backgroundColor: getEventColor(event),
                          color: getReadableTextColor(getEventColor(event)),
                        }}
                      >
                        {event.startTime || "-"} - {event.endTime || "-"}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-zinc-600">
                      <p>ประเภทงาน: {event.service || "-"}</p>
                      <p>สถานที่: {event.location || "-"}</p>
                      <p>โทร: {event.phone || "-"}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openBooking(event)}
                      className="mt-4 w-full rounded-xl px-4 py-2.5 font-semibold text-white transition"
                      style={brandChrome.primaryButton}
                    >
                      ดูใบจอง
                    </button>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl bg-zinc-50 p-6 text-center text-zinc-500">
                  ไม่มีงานในวันนี้
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

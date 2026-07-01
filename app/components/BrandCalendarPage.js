"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

export default function BrandCalendarPage({ brandId }) {
  const router = useRouter();
  const brand = BRAND_CONFIG[brandId];
  const customersKey = `${brandId}_customers`;
  const selectedBookingKey = `${brandId}_selectedBooking`;
  const currentBookingKey = `${brandId}_currentBooking`;
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [visibleDate, setVisibleDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loadMessage, setLoadMessage] = useState("");

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

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    return () => window.clearInterval(sessionCheck);
  }, [brandId]);

  useEffect(() => {
    if (!isAuthorized) return;

    const loadBookings = async () => {
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
          return;
        }

        const localBookings = readArray(customersKey).filter(
          (item) => item.eventDate
        );
        setBookings(localBookings);
        setLoadMessage("ยังไม่พบข้อมูลจากฐานข้อมูล ใช้ข้อมูลในเครื่อง");
      } catch (error) {
        console.error("Cannot load calendar bookings", error);
        setBookings(readArray(customersKey).filter((item) => item.eventDate));
        setLoadMessage("โหลดฐานข้อมูลไม่ได้ ใช้ข้อมูลในเครื่องแทน");
      }
    };

    loadBookings();
    window.addEventListener("focus", loadBookings);
    return () => window.removeEventListener("focus", loadBookings);
  }, [brandId, customersKey, isAuthorized]);

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
    <main className="min-h-screen bg-zinc-100 p-3 text-zinc-900 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1840px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold md:text-4xl">ปฏิทินงาน</h1>
            <p className="mt-2 text-zinc-500">
              แสดงงานจากใบจองของ {brand.name} ในรูปแบบปฏิทินจริง
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {loadMessage} · Google Calendar จะต่อได้หลังเพิ่ม Calendar scope/token
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push(brand.dashboardPath)}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
          >
            กลับเมนูหลัก
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4 md:p-5">
              <div>
                <p className="text-sm font-semibold text-zinc-500">
                  {monthEvents.length} งานในเดือนนี้
                </p>
                <h2 className="mt-1 text-2xl font-bold">
                  {formatThaiMonth(visibleDate)}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToMonth(-1)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 font-semibold hover:bg-zinc-100"
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-xl bg-zinc-900 px-4 py-2 font-semibold text-white hover:bg-zinc-700"
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => goToMonth(1)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 font-semibold hover:bg-zinc-100"
                >
                  ถัดไป
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[1080px]">
                <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50 text-center text-sm font-bold text-zinc-500">
                  {WEEK_DAYS.map((day) => (
                    <div key={day} className="py-4">
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
                        className={`min-h-[168px] border-b border-r border-zinc-100 p-4 text-left transition hover:bg-blue-50 2xl:min-h-[190px] ${
                          isSelected ? "bg-blue-50 ring-2 ring-inset ring-blue-500" : "bg-white"
                        } ${isCurrentMonth ? "" : "text-zinc-300"}`}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-base font-bold ${
                              isToday
                                ? "bg-zinc-900 text-white"
                                : isSelected
                                  ? "bg-blue-600 text-white"
                                  : "text-zinc-700"
                            }`}
                          >
                            {date.getDate()}
                          </span>
                          {dayEvents.length > 0 && (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                              {dayEvents.length}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {dayEvents.slice(0, 4).map((event) => (
                            <div
                              key={`${event.bookingNumber}-${event.startTime}-${event.customerName}`}
                              className="truncate rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                            >
                              {event.startTime || "--:--"} {event.customerName || event.service || "งาน"}
                            </div>
                          ))}
                          {dayEvents.length > 4 && (
                            <p className="text-xs font-semibold text-zinc-400">
                              +{dayEvents.length - 4} งาน
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-3xl bg-white p-5 shadow-xl xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)] xl:overflow-auto">
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
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
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
                      className="mt-4 w-full rounded-xl bg-zinc-900 px-4 py-2.5 font-semibold text-white hover:bg-zinc-700"
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

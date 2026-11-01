const DAY_MS = 86_400_000;
const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });

/** @typedef {{ [key: string]: string | null | undefined }} CustomerListBooking */

export const CUSTOMER_SORT_OPTIONS = [
  ["bookingNumber", "เลขที่ใบจอง"],
  ["customerName", "ชื่อลูกค้า"],
  ["service", "ประเภทงาน"],
  ["eventDate", "วันที่งาน"],
  ["jobStatus", "สถานะงาน"],
  ["createdAt", "วันที่สร้างใบจอง"],
];

export const EVENT_DATE_FILTERS = [
  ["all", "ทั้งหมด"],
  ["upcoming", "งานที่กำลังจะถึง"],
  ["7", "ภายใน 7 วัน"],
  ["30", "ภายใน 30 วัน"],
];

// Parse calendar values, never the localized text rendered in the table.
// Legacy day/month/year and Buddhist years are accepted without writing them back.
/** @param {unknown} value */
export function eventDateTime(value) {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/.exec(text);
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  const match = iso || slash;
  if (!match) return null;
  const [, first, monthText, last] = match;
  let year = Number(iso ? first : last);
  if (year >= 2400 && year <= 2999) year -= 543;
  const month = Number(monthText);
  const day = Number(iso ? last : first);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? time : null;
}

/** @param {unknown} value */
export function formatCustomerEventDate(value) {
  const time = eventDateTime(value);
  if (time === null) return "-";
  const date = new Date(time);
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}/${date.getUTCFullYear() + 543}`;
}

/** @param {string | null | undefined} value */
export function formatCustomerCreatedAt(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "numeric", day: "numeric",
  }).format(new Date(value));
}

export function bangkokTodayTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

/** @param {CustomerListBooking} booking @param {string} sortBy */
function sortValue(booking, sortBy) {
  if (sortBy === "eventDate") return eventDateTime(booking.eventDate);
  if (sortBy === "createdAt") {
    if (!booking.createdAt) return null;
    const time = Date.parse(booking.createdAt);
    return Number.isFinite(time) ? time : null;
  }
  const value = sortBy === "jobStatus"
    ? booking.jobStatus || booking.status || "รอดำเนินการ"
    : booking[sortBy];
  return value == null || String(value).trim() === "" ? null : String(value);
}

/** @param {readonly CustomerListBooking[]} bookings */
export function selectCustomerBookings(bookings, {
  search = "", sortBy = "bookingNumber", sortDirection = "desc",
  dateFilter = "all", today = bangkokTodayTime(),
} = {}) {
  const keyword = search.trim().toLocaleLowerCase("th");
  const key = CUSTOMER_SORT_OPTIONS.some(([value]) => value === sortBy)
    ? sortBy : "bookingNumber";
  const direction = sortDirection === "asc" ? 1 : -1;
  const matches = bookings.filter((booking) => {
    if (dateFilter !== "all") {
      const time = eventDateTime(booking.eventDate);
      if (time === null || time < today) return false;
      // The 7/30 day windows include today and the next 6/29 calendar days.
      if (["7", "30"].includes(dateFilter) && time >= today + Number(dateFilter) * DAY_MS) {
        return false;
      }
    }
    return !keyword || [
      booking.bookingNumber, booking.customerName, booking.phone, booking.email,
      booking.service, booking.location, booking.jobStatus, booking.status,
    ].some((value) => String(value ?? "").toLocaleLowerCase("th").includes(keyword));
  });

  return matches.sort((a, b) => {
    const first = sortValue(a, key);
    const second = sortValue(b, key);
    // Missing/invalid values stay last in either direction.
    if (first === null || second === null) {
      if (first !== second) return first === null ? 1 : -1;
    } else {
      const compared = typeof first === "number" && typeof second === "number"
        ? first - second : collator.compare(String(first), String(second));
      if (compared) return compared * direction;
    }
    return collator.compare(a.bookingNumber || "", b.bookingNumber || "") ||
      collator.compare(a.supabaseId || "", b.supabaseId || "");
  });
}

import { google } from "googleapis";

export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar";

const BRAND_CONFIG = {
  pharadol: {
    name: "PHARADOL PRODUCTION",
    clientId: process.env.PHARADOL_GOOGLE_CLIENT_ID,
    clientSecret: process.env.PHARADOL_GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.PHARADOL_GOOGLE_REFRESH_TOKEN,
    calendarId: process.env.PHARADOL_GOOGLE_CALENDAR_ID,
    bookingPath: "/pharadol?view=customer",
  },
  adisorn: {
    name: "ADISORN WEDDING STUDIO",
    clientId: process.env.ADISORN_GOOGLE_CLIENT_ID,
    clientSecret: process.env.ADISORN_GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.ADISORN_GOOGLE_REFRESH_TOKEN,
    calendarId: process.env.ADISORN_GOOGLE_CALENDAR_ID,
    bookingPath: "/adisorn?view=customer",
  },
};

const BRAND_ENV_NAMES = {
  pharadol:
    "PHARADOL_GOOGLE_CLIENT_ID, PHARADOL_GOOGLE_CLIENT_SECRET, PHARADOL_GOOGLE_REFRESH_TOKEN และ PHARADOL_GOOGLE_CALENDAR_ID",
  adisorn:
    "ADISORN_GOOGLE_CLIENT_ID, ADISORN_GOOGLE_CLIENT_SECRET, ADISORN_GOOGLE_REFRESH_TOKEN และ ADISORN_GOOGLE_CALENDAR_ID",
};

const CALENDAR_SCOPE_ERROR =
  "กรุณาเชื่อมต่อ Google ใหม่เพื่ออนุญาต Google Calendar";

const pad = (value) => String(value).padStart(2, "0");

const isValidTime = (value) => /^\d{2}:\d{2}$/.test(String(value || ""));

const addHoursToTime = (time, hours) => {
  const [hour, minute] = String(time || "09:00").split(":").map(Number);
  const date = new Date(2000, 0, 1, hour || 0, minute || 0);
  date.setHours(date.getHours() + hours);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const addDays = (dateValue, days) => {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  const date = new Date(year, month - 1, day || 1);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
};

const getAppBaseUrl = (requestUrl) => {
  const envUrl = String(process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (envUrl) return envUrl;

  if (!requestUrl) return "";

  return `${requestUrl.protocol}//${requestUrl.host}`.replace(/\/$/, "");
};

const getBookingViewUrl = ({ brandConfig, booking, requestUrl }) => {
  const baseUrl = getAppBaseUrl(requestUrl);
  const bookingNumber = encodeURIComponent(booking?.bookingNumber || "");

  return baseUrl
    ? `${baseUrl}${brandConfig.bookingPath}&booking=${bookingNumber}`
    : "";
};

const formatBookingTime = (booking) => {
  const startTime = isValidTime(booking?.startTime) ? booking.startTime : "";
  const endTime = isValidTime(booking?.endTime) ? booking.endTime : "";

  if (!startTime) return "ทั้งวัน";
  return endTime ? `${startTime} - ${endTime}` : `${startTime} - ${addHoursToTime(startTime, 2)}`;
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 0,
  });

const getServiceSummary = (booking) => {
  if (Array.isArray(booking?.serviceItems) && booking.serviceItems.length > 0) {
    return booking.serviceItems
      .map((item) => {
        const name = item?.name || item?.serviceName || item?.title || "";
        const quantity = item?.quantity ? ` x${item.quantity}` : "";
        return `${name}${quantity}`.trim();
      })
      .filter(Boolean)
      .join(", ");
  }

  return booking?.service || "-";
};

const buildEventTimes = (booking) => {
  const eventDate = String(booking?.eventDate || "").slice(0, 10);

  if (!eventDate) {
    throw new Error("ไม่พบวันที่งานสำหรับสร้าง Google Calendar Event");
  }

  const startTime = isValidTime(booking?.startTime) ? booking.startTime : "";
  const endTime = isValidTime(booking?.endTime) ? booking.endTime : "";

  if (!startTime) {
    return {
      start: { date: eventDate },
      end: { date: addDays(eventDate, 1) },
    };
  }

  const resolvedEndTime = endTime || addHoursToTime(startTime, 2);
  const startDateTime = `${eventDate}T${startTime}:00+07:00`;
  let endDateTime = `${eventDate}T${resolvedEndTime}:00+07:00`;

  if (new Date(endDateTime).getTime() <= new Date(startDateTime).getTime()) {
    endDateTime = `${eventDate}T${addHoursToTime(startTime, 2)}:00+07:00`;
  }

  return {
    start: { dateTime: startDateTime, timeZone: "Asia/Bangkok" },
    end: { dateTime: endDateTime, timeZone: "Asia/Bangkok" },
  };
};

const buildCalendarEvent = ({ brandConfig, booking, requestUrl, mode }) => {
  const isTrashed = mode === "trash";
  const customerName = booking?.customerName ? `คุณ${booking.customerName}` : "-";
  const bookingNumber = booking?.bookingNumber || "-";
  const service = booking?.service || "-";
  const summaryPrefix = isTrashed ? "[ยกเลิก/ถังขยะ] " : "";
  const bookingViewUrl = getBookingViewUrl({ brandConfig, booking, requestUrl });
  const eventTimes = buildEventTimes(booking);

  return {
    summary: `${summaryPrefix}${bookingNumber} | ${customerName} | ${service}`,
    location: booking?.location || "",
    description: [
      `แบรนด์: ${brandConfig.name}`,
      `เลขใบจอง: ${bookingNumber}`,
      `ชื่อลูกค้า: ${booking?.customerName || "-"}`,
      `เบอร์โทร: ${booking?.phone || "-"}`,
      `อีเมล: ${booking?.email || "-"}`,
      `วันที่งาน: ${booking?.eventDate || "-"}`,
      `เวลา: ${formatBookingTime(booking)}`,
      `สถานที่: ${booking?.location || "-"}`,
      `รายการบริการ: ${getServiceSummary(booking)}`,
      `ยอดรวมสุทธิ: ${formatMoney(booking?.finalPrice)} บาท`,
      `ยอดชำระแล้ว: ${formatMoney(booking?.totalPaid)} บาท`,
      `ยอดคงเหลือ: ${formatMoney(booking?.remainingPayment)} บาท`,
      bookingViewUrl ? `ลิงก์เปิดใบจองในระบบ: ${bookingViewUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    ...eventTimes,
    ...(isTrashed ? { colorId: "8" } : {}),
  };
};

export const getReadableCalendarError = (error, brandId) => {
  const rawGoogleError =
    error?.response?.data?.error_description ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "ซิงก์ Google Calendar ไม่สำเร็จ";
  const message =
    typeof rawGoogleError === "string"
      ? rawGoogleError
      : rawGoogleError?.message || "ซิงก์ Google Calendar ไม่สำเร็จ";
  const normalized = String(message).toLowerCase();

  if (error?.code === "CALENDAR_SCOPE_REQUIRED") {
    return CALENDAR_SCOPE_ERROR;
  }

  if (
    normalized.includes("api has not been used") ||
    normalized.includes("disabled") ||
    normalized.includes("access not configured") ||
    normalized.includes("calendar api")
  ) {
    return "Google Calendar API ยังไม่ได้เปิดใช้งาน กรุณาเปิด Google Calendar API ใน Google Cloud แล้วลองซิงก์อีกครั้ง";
  }

  if (
    normalized.includes("insufficient") ||
    normalized.includes("permission") ||
    normalized.includes("scope")
  ) {
    return CALENDAR_SCOPE_ERROR;
  }

  if (
    normalized.includes("invalid_grant") ||
    normalized.includes("token has been expired") ||
    normalized.includes("revoked")
  ) {
    return "Google refresh token ใช้ไม่ได้หรือหมดอายุ กรุณาเชื่อมต่อ Google ใหม่";
  }

  if (
    normalized.includes("client secret") ||
    normalized.includes("invalid_client") ||
    normalized.includes("unauthorized_client")
  ) {
    return `Google Client Secret ไม่ถูกต้อง กรุณาตรวจค่า ${BRAND_ENV_NAMES[brandId] || BRAND_ENV_NAMES.pharadol}`;
  }

  return message;
};

export const getGoogleCalendarClient = async (brandId) => {
  const config = BRAND_CONFIG[brandId] || null;

  if (!config) {
    throw new Error("ไม่พบแบรนด์สำหรับ Google Calendar");
  }

  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error(`ตั้งค่า Google Calendar ไม่ครบ กรุณาตรวจค่า ${BRAND_ENV_NAMES[brandId]}`);
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: config.refreshToken,
  });

  const accessToken = await oauth2Client.getAccessToken();
  const token = accessToken?.token || "";

  if (token) {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const tokenInfo = await oauth2.tokeninfo({ access_token: token });
    const scopes = String(tokenInfo.data.scope || "").split(/\s+/);

    if (!scopes.includes(CALENDAR_SCOPE)) {
      const scopeError = new Error(CALENDAR_SCOPE_ERROR);
      scopeError.code = "CALENDAR_SCOPE_REQUIRED";
      throw scopeError;
    }
  }

  return {
    calendar: google.calendar({ version: "v3", auth: oauth2Client }),
    calendarId: String(config.calendarId || "").trim() || "primary",
    brandConfig: config,
  };
};

export const syncBookingToGoogleCalendar = async ({
  brandId,
  booking,
  googleCalendarEventId,
  requestUrl,
  mode = "upsert",
}) => {
  const { calendar, calendarId, brandConfig } =
    await getGoogleCalendarClient(brandId);
  const eventId =
    String(googleCalendarEventId || booking?.googleCalendarEventId || "").trim();

  if (mode === "delete") {
    if (!eventId) {
      return { action: "none", eventId: "" };
    }

    try {
      await calendar.events.delete({ calendarId, eventId });
    } catch (error) {
      const status = error?.response?.status || error?.code;
      if (status !== 404 && status !== 410) throw error;
    }

    return { action: "deleted", eventId };
  }

  const calendarEvent = buildCalendarEvent({
    brandConfig,
    booking,
    requestUrl,
    mode,
  });

  if (eventId) {
    try {
      const updatedEvent = await calendar.events.update({
        calendarId,
        eventId,
        requestBody: calendarEvent,
      });

      return {
        action: "updated",
        eventId: updatedEvent.data.id || eventId,
        htmlLink: updatedEvent.data.htmlLink || "",
      };
    } catch (error) {
      const status = error?.response?.status || error?.code;
      if (status !== 404 && status !== 410) throw error;
    }
  }

  const createdEvent = await calendar.events.insert({
    calendarId,
    requestBody: calendarEvent,
  });

  return {
    action: "created",
    eventId: createdEvent.data.id || "",
    htmlLink: createdEvent.data.htmlLink || "",
  };
};

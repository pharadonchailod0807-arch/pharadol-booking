export const getGoogleCalendarSyncStatus = (booking = {}) => {
  if (
    booking.googleCalendarSyncStatus === "failed" ||
    booking.googleCalendarSyncStatus === "error"
  ) {
    return "ซิงก์ไม่สำเร็จ";
  }
  if (booking.googleCalendarEventId) return "ซิงก์แล้ว";
  return "ยังไม่ซิงก์";
};

export const applyGoogleCalendarSyncResult = (
  booking = {},
  result = {},
  fallbackStatus = "synced"
) => ({
  ...booking,
  googleCalendarEventId:
    result.googleCalendarEventId || result.eventId || booking.googleCalendarEventId || "",
  googleCalendarEventLink:
    result.htmlLink || booking.googleCalendarEventLink || "",
  googleCalendarSyncStatus:
    result.success === false
      ? "failed"
      : result.googleCalendarSyncStatus || fallbackStatus,
  googleCalendarSyncError: result.success === false ? result.error || "" : "",
  googleCalendarSyncedAt:
    result.success === false
      ? booking.googleCalendarSyncedAt || ""
      : new Date().toISOString(),
});

export const markGoogleCalendarSyncError = (booking = {}, message = "") => ({
  ...booking,
  googleCalendarSyncStatus: "failed",
  googleCalendarSyncError: message || "ซิงก์ Google Calendar ไม่สำเร็จ",
});

export const syncBookingGoogleCalendar = async ({
  brand,
  booking,
  mode = "upsert",
  timeoutMs = 12000,
}) => {
  const controller = new AbortController();
  const timeoutId =
    timeoutMs > 0
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let response;

  try {
    response = await fetch("/api/google/calendar/sync-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        brand,
        bookingNumber: booking?.bookingNumber || "",
        booking,
        googleCalendarEventId: booking?.googleCalendarEventId || "",
        mode,
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("ซิงก์ Google Calendar ใช้เวลานานเกินไป กรุณาลองซิงก์อีกครั้ง");
    }

    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(result?.error || "ซิงก์ Google Calendar ไม่สำเร็จ");
  }

  return result;
};

export const deleteBookingGoogleCalendarEvent = async ({ brand, booking }) => {
  if (!booking?.googleCalendarEventId) {
    return { success: true, action: "none", eventId: "" };
  }

  const response = await fetch("/api/google/calendar/delete-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand,
      bookingNumber: booking?.bookingNumber || "",
      booking,
      googleCalendarEventId: booking?.googleCalendarEventId || "",
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(result?.error || "ลบ Google Calendar Event ไม่สำเร็จ");
  }

  return result;
};

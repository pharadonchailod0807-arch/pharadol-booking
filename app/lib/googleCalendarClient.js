export const getGoogleCalendarSyncStatus = (booking = {}) => {
  if (booking.googleCalendarSyncStatus === "error") return "ซิงก์ไม่สำเร็จ";
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
    result.eventId || booking.googleCalendarEventId || "",
  googleCalendarEventLink:
    result.htmlLink || booking.googleCalendarEventLink || "",
  googleCalendarSyncStatus: result.success === false ? "error" : fallbackStatus,
  googleCalendarSyncError: result.success === false ? result.error || "" : "",
  googleCalendarSyncedAt:
    result.success === false
      ? booking.googleCalendarSyncedAt || ""
      : new Date().toISOString(),
});

export const markGoogleCalendarSyncError = (booking = {}, message = "") => ({
  ...booking,
  googleCalendarSyncStatus: "error",
  googleCalendarSyncError: message || "ซิงก์ Google Calendar ไม่สำเร็จ",
});

export const syncBookingGoogleCalendar = async ({
  brand,
  booking,
  mode = "upsert",
}) => {
  const response = await fetch("/api/google/calendar/sync-booking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand,
      bookingNumber: booking?.bookingNumber || "",
      booking,
      googleCalendarEventId: booking?.googleCalendarEventId || "",
      mode,
    }),
  });

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

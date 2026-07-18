import {
  getReadableCalendarError,
  syncBookingToGoogleCalendar,
} from "@/lib/google-calendar";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_BRANDS = new Set(["pharadol", "adisorn"]);

export async function POST(request) {
  let brandId = "";

  try {
    const payload = await request.json().catch(() => ({}));
    brandId = String(payload?.brand || payload?.brandId || "").trim();
    const booking = payload?.booking || {};
    const bookingNumber =
      String(payload?.bookingNumber || booking?.bookingNumber || "").trim();
    const mode = String(payload?.mode || "upsert").trim();

    if (!VALID_BRANDS.has(brandId)) {
      return Response.json(
        { success: false, error: "ไม่พบแบรนด์สำหรับ Google Calendar" },
        { status: 400 }
      );
    }

    if (!bookingNumber) {
      return Response.json(
        { success: false, error: "ไม่พบเลขใบจองสำหรับซิงก์ Google Calendar" },
        { status: 400 }
      );
    }

    const result = await syncBookingToGoogleCalendar({
      brandId,
      booking: {
        ...booking,
        bookingNumber,
      },
      googleCalendarEventId: payload?.googleCalendarEventId,
      requestUrl: new URL(request.url),
      mode,
    });

    return Response.json({
      success: true,
      ...result,
      googleCalendarEventId: result.eventId || "",
      googleCalendarSyncStatus:
        mode === "delete" ? "deleted" : "synced",
    });
  } catch (error) {
    console.error("Google Calendar booking sync error:", error);

    return Response.json(
      {
        success: false,
        error: getReadableCalendarError(error, brandId),
      },
      { status: 500 }
    );
  }
}

import {
  getReadableCalendarError,
  syncBookingToGoogleCalendar,
} from "@/lib/google-calendar";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  let brandId = "";

  try {
    const payload = await request.json().catch(() => ({}));
    brandId = String(payload?.brand || payload?.brandId || "").trim();
    const booking = payload?.booking || {};

    const result = await syncBookingToGoogleCalendar({
      brandId,
      booking,
      googleCalendarEventId: "",
      requestUrl: new URL(request.url),
      mode: "upsert",
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Google Calendar create event error:", error);

    return Response.json(
      {
        success: false,
        error: getReadableCalendarError(error, brandId),
      },
      { status: 500 }
    );
  }
}

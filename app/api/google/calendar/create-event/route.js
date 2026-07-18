import {
  getReadableCalendarError,
  syncBookingToGoogleCalendar,
} from "@/lib/google-calendar";
import {
  normalizeBrand,
  rejectCrossSiteRequest,
} from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  let brandId = "";

  try {
    const blockedCrossSite = rejectCrossSiteRequest(request);
    if (blockedCrossSite) return blockedCrossSite;

    const payload = await request.json().catch(() => ({}));
    brandId = normalizeBrand(payload?.brand || payload?.brandId);
    const booking = payload?.booking || {};

    if (!brandId) {
      return Response.json(
        { success: false, error: "ไม่พบแบรนด์สำหรับ Google Calendar" },
        { status: 400 }
      );
    }

    const result = await syncBookingToGoogleCalendar({
      brandId,
      booking,
      googleCalendarEventId: "",
      requestUrl: new URL(request.url),
      mode: "upsert",
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error(
      "Google Calendar create event error:",
      error?.response?.data?.error || error?.response?.data?.message || error?.message || "unknown error"
    );

    return Response.json(
      {
        success: false,
        error: getReadableCalendarError(error, brandId),
      },
      { status: 500 }
    );
  }
}

import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const VALID_BRANDS = new Set(["pharadol", "adisorn"]);
const VALID_STATUSES = new Set([
  "new",
  "viewed",
  "contacted",
  "converted",
  "created_booking",
]);

const sanitize = (value, maxLength = 1000) =>
  String(value || "").trim().slice(0, maxLength);

const normalizeRequest = (request) => ({
  id: request.id,
  brand: request.brand,
  customerName: request.customer_name || "",
  phone: request.phone || "",
  email: request.email || "",
  eventLocation: request.event_location || "",
  eventDate: request.event_date || "",
  note: request.note || "",
  slipUrl: request.slip_url || "",
  slipFileName: request.slip_file_name || "",
  slipFileType: request.slip_file_type || "",
  status: request.status || "new",
  source: request.source || "customer_form",
  createdAt: request.created_at || "",
  bookingId: request.booking_id || "",
});

const getReadableError = (error) => {
  const message = String(error?.message || error || "");

  if (message.includes("customer_requests")) {
    return "ยังไม่ได้สร้างตาราง customer_requests ใน Supabase กรุณารันไฟล์ supabase-customer-requests.sql";
  }

  return message || "ทำรายการไม่สำเร็จ";
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const brand = sanitize(searchParams.get("brand"), 20);

  if (!VALID_BRANDS.has(brand)) {
    return Response.json({ success: false, error: "ไม่พบแบรนด์" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("customer_requests")
    .select("*")
    .eq("brand", brand)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json(
      { success: false, error: getReadableError(error) },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    requests: Array.isArray(data) ? data.map(normalizeRequest) : [],
  });
}

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const brand = sanitize(payload?.brand, 20);

  if (!VALID_BRANDS.has(brand)) {
    return Response.json({ success: false, error: "ไม่พบแบรนด์" }, { status: 400 });
  }

  const customerName = sanitize(payload?.customerName, 160);
  const phone = sanitize(payload?.phone, 80);
  const eventLocation = sanitize(payload?.eventLocation, 300);
  const eventDate = sanitize(payload?.eventDate, 20);

  if (!customerName || !phone || !eventLocation || !eventDate) {
    return Response.json(
      { success: false, error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบ" },
      { status: 400 }
    );
  }

  const insertPayload = {
    brand,
    customer_name: customerName,
    phone,
    email: sanitize(payload?.email, 180),
    event_location: eventLocation,
    event_date: eventDate,
    note: sanitize(payload?.note, 3000),
    slip_url: sanitize(payload?.slipUrl, 1200),
    slip_file_name: sanitize(payload?.slipFileName, 240),
    slip_file_type: sanitize(payload?.slipFileType, 120),
    status: "new",
    source: "customer_form",
  };

  const { data, error } = await supabase
    .from("customer_requests")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return Response.json(
      { success: false, error: getReadableError(error) },
      { status: 500 }
    );
  }

  return Response.json({ success: true, request: normalizeRequest(data) });
}

export async function PATCH(request) {
  const payload = await request.json().catch(() => null);
  const id = sanitize(payload?.id, 80);
  const brand = sanitize(payload?.brand, 20);
  const status = sanitize(payload?.status, 40);

  if (!id || !VALID_BRANDS.has(brand) || !VALID_STATUSES.has(status)) {
    return Response.json(
      { success: false, error: "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const updatePayload = {
    status,
    ...(payload?.bookingId ? { booking_id: sanitize(payload.bookingId, 120) } : {}),
  };

  const { data, error } = await supabase
    .from("customer_requests")
    .update(updatePayload)
    .eq("id", id)
    .eq("brand", brand)
    .select()
    .single();

  if (error) {
    return Response.json(
      { success: false, error: getReadableError(error) },
      { status: 500 }
    );
  }

  return Response.json({ success: true, request: normalizeRequest(data) });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = sanitize(searchParams.get("id"), 80);
  const brand = sanitize(searchParams.get("brand"), 20);

  if (!id || !VALID_BRANDS.has(brand)) {
    return Response.json(
      { success: false, error: "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("customer_requests")
    .delete()
    .eq("id", id)
    .eq("brand", brand);

  if (error) {
    return Response.json(
      { success: false, error: getReadableError(error) },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}

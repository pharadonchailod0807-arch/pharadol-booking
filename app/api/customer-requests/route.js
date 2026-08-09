import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit-log";
import { requireApiPermission } from "@/lib/server-auth";
import {
  getClientIp,
  normalizeBrand,
  rateLimit,
  rejectCrossSiteRequest,
  rejectDocumentNavigation,
  sanitizeMultilineText,
  sanitizeText,
} from "@/lib/security";

export const runtime = "nodejs";

const VALID_BRANDS = new Set(["pharadol", "adisorn"]);
const VALID_STATUSES = new Set([
  "new",
  "viewed",
  "contacted",
  "converted",
  "created_booking",
]);
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const SAFE_FILE_TYPES = new Set([
  "",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const sanitize = sanitizeText;

const normalizeRequest = (request) => ({
  id: request.id,
  brand: request.brand,
  customerName: request.customer_name || "",
  phone: request.phone || "",
  email: request.email || "",
  jobType: request.job_type || request.jobType || request.event_type || "",
  eventLocation: request.event_location || "",
  eventDate: request.event_date || "",
  note: request.note || request.details || request.additional_details || "",
  calendarColor: request.calendar_color || request.event_color || "",
  slipUrl: request.slip_url || "",
  slipFileName: request.slip_file_name || "",
  slipFileType: request.slip_file_type || "",
  status: request.status || "new",
  source: request.source || "customer_form",
  createdAt: request.created_at || "",
  bookingId: request.booking_id || "",
  deletedAt: request.deleted_at || "",
});

const getReadableError = (error) => {
  const message = String(error?.message || error || "");

  if (message.includes("customer_requests")) {
    return "ยังไม่ได้สร้างตาราง customer_requests ใน Supabase กรุณารันไฟล์ supabase-customer-requests.sql";
  }

  return message || "ทำรายการไม่สำเร็จ";
};

const parsePage = (value) => {
  const page = Number(value || 0);
  return Number.isFinite(page) ? Math.max(Math.floor(page), 0) : 0;
};

const parsePageSize = (value) => {
  const pageSize = Number(value || DEFAULT_PAGE_SIZE);
  return Number.isFinite(pageSize)
    ? Math.min(Math.max(Math.floor(pageSize), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
};

export async function GET(request) {
  const blockedNavigation = rejectDocumentNavigation(request);
  if (blockedNavigation) return blockedNavigation;

  const { searchParams } = new URL(request.url);
  const brand = normalizeBrand(searchParams.get("brand"));
  const trashMode = searchParams.get("trash") === "1";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));
  const from = page * pageSize;
  const to = from + pageSize - 1;

  if (!VALID_BRANDS.has(brand)) {
    return Response.json(
      { success: false, error: "ไม่พบแบรนด์" },
      { status: 400 }
    );
  }

  const auth = requireApiPermission({
    request,
    permission: "customers.view",
    brandId: brand,
    missingBrandMessage: "ไม่พบแบรนด์",
    deniedMessage: "ไม่มีสิทธิ์เข้าถึงคำขอลูกค้าแบรนด์นี้",
  });
  if (auth.response) return auth.response;

  let query = supabase
    .from("customer_requests")
    .select("*", { count: "exact" })
    .eq("brand", brand);

  query = trashMode
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);

  const { data, error, count } = await query
    .order("created_at", {
      ascending: false,
    })
    .range(from, to);

  if (error) {
    return Response.json(
      { success: false, error: getReadableError(error) },
      { status: 500 }
    );
  }

  return Response.json(
    {
      success: true,
      requests: Array.isArray(data) ? data.map(normalizeRequest) : [],
      page,
      pageSize,
      total: Number(count || 0),
      hasMore: count == null ? Array.isArray(data) && data.length === pageSize : to + 1 < count,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(request) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const payload = await request.json().catch(() => null);
  const brand = normalizeBrand(payload?.brand);

  if (!VALID_BRANDS.has(brand)) {
    return Response.json({ success: false, error: "ไม่พบแบรนด์" }, { status: 400 });
  }

  const limited = rateLimit({
    key: `customer-request:${brand}:${getClientIp(request)}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
    message: "ส่งข้อมูลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  });
  if (limited) return limited;

  const customerName = sanitize(payload?.customerName, 160);
  const phone = sanitize(payload?.phone, 80);
  const eventLocation = sanitize(payload?.eventLocation, 300);
  const eventDate = sanitize(payload?.eventDate, 20);
  const email = sanitize(payload?.email, 180);
  const slipFileType = sanitize(payload?.slipFileType, 120);

  if (!customerName || !phone || !eventLocation || !eventDate) {
    return Response.json(
      { success: false, error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบ" },
      { status: 400 }
    );
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    return Response.json(
      { success: false, error: "อีเมลไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return Response.json(
      { success: false, error: "วันที่งานไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  if (!SAFE_FILE_TYPES.has(slipFileType)) {
    return Response.json(
      { success: false, error: "ประเภทไฟล์สลิปไม่ปลอดภัย" },
      { status: 400 }
    );
  }

  const insertPayload = {
    brand,
    customer_name: customerName,
    phone,
    email,
    event_location: eventLocation,
    event_date: eventDate,
    note: sanitizeMultilineText(payload?.note, 3000),
    slip_url: sanitize(payload?.slipUrl, 1200),
    slip_file_name: sanitize(payload?.slipFileName, 240),
    slip_file_type: slipFileType,
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
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const payload = await request.json().catch(() => null);
  const id = sanitize(payload?.id, 80);
  const brand = normalizeBrand(payload?.brand);
  const status = sanitize(payload?.status, 40);
  const action = sanitize(payload?.action, 40);
  const isRestore = action === "restore";

  if (
    !id ||
    !VALID_BRANDS.has(brand) ||
    (!isRestore && !VALID_STATUSES.has(status))
  ) {
    return Response.json(
      { success: false, error: "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const auth = requireApiPermission({
    request,
    permission: isRestore ? "trash.restore" : "customers.edit",
    brandId: brand,
    missingBrandMessage: "ไม่พบแบรนด์",
    deniedMessage: isRestore
      ? "ไม่มีสิทธิ์กู้คืนคำขอลูกค้าแบรนด์นี้"
      : "ไม่มีสิทธิ์แก้ไขคำขอลูกค้าแบรนด์นี้",
  });
  if (auth.response) return auth.response;

  const updatePayload = isRestore
    ? {
        deleted_at: null,
      }
    : {
        status,
        ...(payload?.bookingId
          ? { booking_id: sanitize(payload.bookingId, 120) }
          : {}),
      };

  let updateQuery = supabase
    .from("customer_requests")
    .update(updatePayload)
    .eq("id", id)
    .eq("brand", brand);

  updateQuery = isRestore
    ? updateQuery.not("deleted_at", "is", null)
    : updateQuery.is("deleted_at", null);

  const { data, error } = await updateQuery
    .select()
    .single();

  if (error) {
    await writeAuditLog({
      request,
      user: auth.user,
      brand,
      action: isRestore ? "CUSTOMER_REQUEST_RESTORED" : "CUSTOMER_UPDATED",
      resourceType: "customer_request",
      resourceId: id,
      result: "failure",
      metadata: { reason: getReadableError(error) },
    });
    return Response.json(
      { success: false, error: getReadableError(error) },
      { status: 500 }
    );
  }

  await writeAuditLog({
    request,
    user: auth.user,
    brand,
    action: isRestore ? "CUSTOMER_REQUEST_RESTORED" : "CUSTOMER_UPDATED",
    resourceType: "customer_request",
    resourceId: id,
    result: "success",
  });

  return Response.json({
    success: true,
    request: normalizeRequest(data),
  });
}

export async function DELETE(request) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const { searchParams } = new URL(request.url);
  const id = sanitize(searchParams.get("id"), 80);
  const brand = normalizeBrand(searchParams.get("brand"));
  const permanent = searchParams.get("permanent") === "1";

  if (!id || !VALID_BRANDS.has(brand)) {
    return Response.json(
      { success: false, error: "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const auth = requireApiPermission({
    request,
    permission: permanent ? "customers.permanent_delete" : "customers.delete",
    brandId: brand,
    missingBrandMessage: "ไม่พบแบรนด์",
    deniedMessage: permanent
      ? "ไม่มีสิทธิ์ลบคำขอลูกค้าถาวร"
      : "ไม่มีสิทธิ์ลบคำขอลูกค้าแบรนด์นี้",
  });
  if (auth.response) return auth.response;

  let data;
  let error;

  if (permanent) {
    const result = await supabase
      .from("customer_requests")
      .delete()
      .eq("id", id)
      .eq("brand", brand)
      .not("deleted_at", "is", null)
      .select()
      .maybeSingle();

    data = result.data;
    error = result.error;
  } else {
    const result = await supabase
      .from("customer_requests")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("brand", brand)
      .is("deleted_at", null)
      .select()
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) {
    await writeAuditLog({
      request,
      user: auth.user,
      brand,
      action: permanent ? "CUSTOMER_PERMANENT_DELETED" : "CUSTOMER_DELETED",
      resourceType: "customer_request",
      resourceId: id,
      result: "failure",
      metadata: { reason: getReadableError(error) },
    });
    return Response.json(
      { success: false, error: getReadableError(error) },
      { status: 500 }
    );
  }

  await writeAuditLog({
    request,
    user: auth.user,
    brand,
    action: permanent ? "CUSTOMER_PERMANENT_DELETED" : "CUSTOMER_DELETED",
    resourceType: "customer_request",
    resourceId: id,
    result: "success",
  });

  return Response.json({
    success: true,
    permanent,
    request: data ? normalizeRequest(data) : null,
  });
}

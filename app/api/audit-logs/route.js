import { supabase } from "@/lib/supabase";
import { requireApiPermission } from "@/lib/server-auth";
import {
  normalizeBrand,
  rejectDocumentNavigation,
  sanitizeText,
} from "@/lib/security";
import { canAccessBrand, hasRole, normalizeSessionBrands } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const AUDIT_SELECT =
  "id,timestamp,user_id,username,brand,role,action,resource_type,resource_id,result,metadata,ip,user_agent";

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

const normalizeAuditLog = (row = {}) => ({
  id: row.id || "",
  timestamp: row.timestamp || "",
  userId: row.user_id || "",
  username: row.username || "",
  brand: row.brand || "",
  role: row.role || "",
  action: row.action || "",
  resourceType: row.resource_type || "",
  resourceId: row.resource_id || "",
  result: row.result || "",
  metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  ip: row.ip || "",
  userAgent: row.user_agent || "",
});

const getReadableAuditError = (error) => {
  const message = String(error?.message || error || "");
  if (message.includes("audit_logs")) {
    return "ยังไม่ได้สร้างตาราง audit_logs กรุณารันไฟล์ supabase-audit-logs.sql";
  }
  return message || "โหลด Audit Log ไม่สำเร็จ";
};

export async function GET(request) {
  const blockedNavigation = rejectDocumentNavigation(request);
  if (blockedNavigation) return blockedNavigation;

  const { searchParams } = new URL(request.url);
  const requestedBrand = normalizeBrand(searchParams.get("brand"));

  const auth = requireApiPermission({
    request,
    permission: "audit.view",
    brandId: requestedBrand || undefined,
    missingBrandMessage: "ไม่พบแบรนด์",
    deniedMessage: "ไม่มีสิทธิ์ดู Audit Log",
  });
  if (auth.response) return auth.response;

  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const action = sanitizeText(searchParams.get("action"), 120);
  const result = sanitizeText(searchParams.get("result"), 80);
  const resourceType = sanitizeText(searchParams.get("resourceType"), 120);
  const user = sanitizeText(searchParams.get("user"), 180).replace(/[%_,]/g, " ");
  const dateFrom = sanitizeText(searchParams.get("dateFrom"), 20);
  const dateTo = sanitizeText(searchParams.get("dateTo"), 20);

  let query = supabase
    .from("audit_logs")
    .select(AUDIT_SELECT, { count: "exact" });

  if (requestedBrand) {
    if (!canAccessBrand(auth.user, requestedBrand)) {
      return Response.json({ success: false, error: "ไม่มีสิทธิ์ดู Audit Log แบรนด์นี้" }, { status: 403 });
    }
    query = query.eq("brand", requestedBrand);
  } else if (!hasRole(auth.user, "SUPER_ADMIN")) {
    const allowedBrands = normalizeSessionBrands(auth.user?.brands, auth.user?.role);
    if (allowedBrands.length === 0) {
      return Response.json({ success: false, error: "ไม่มีสิทธิ์ดู Audit Log" }, { status: 403 });
    }
    query = query.in("brand", allowedBrands);
  }

  if (action) query = query.eq("action", action);
  if (result) query = query.eq("result", result);
  if (resourceType) query = query.eq("resource_type", resourceType);
  if (user) query = query.or(`username.ilike.%${user}%,user_id.ilike.%${user}%`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    query = query.gte("timestamp", `${dateFrom}T00:00:00.000Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    query = query.lte("timestamp", `${dateTo}T23:59:59.999Z`);
  }

  const { data, error, count } = await query
    .order("timestamp", { ascending: false })
    .range(from, to);

  if (error) {
    return Response.json(
      { success: false, error: getReadableAuditError(error) },
      { status: 500 }
    );
  }

  return Response.json(
    {
      success: true,
      logs: Array.isArray(data) ? data.map(normalizeAuditLog) : [],
      page,
      pageSize,
      total: Number(count || 0),
      hasMore: count == null ? Array.isArray(data) && data.length === pageSize : to + 1 < count,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

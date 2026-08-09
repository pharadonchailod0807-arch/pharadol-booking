import { AUTH_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { can, canAccessBrand } from "@/lib/rbac";
import { normalizeBrand, sanitizeText } from "@/lib/security";

export const getSessionUserFromRequest = (request) => {
  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value || "";
  const user = verifySessionToken(token);

  if (!user || user.active === false) return null;
  return user;
};

export const getActorName = (user) =>
  String(user?.username || user?.name || user?.id || "").trim().slice(0, 160);

export const permissionDeniedResponse = ({
  request,
  user,
  brand = "",
  permission = "",
  resourceType = "",
  resourceId = "",
  deniedMessage = "ไม่มีสิทธิ์ทำรายการนี้",
  status = 403,
} = {}) => {
  if (user && request) {
    void writeAuditLog({
      request,
      user,
      brand,
      action: "PERMISSION_DENIED",
      resourceType,
      resourceId,
      result: "failure",
      metadata: {
        permission: sanitizeText(permission, 120),
        brand: sanitizeText(brand, 40),
      },
    });
  }

  return Response.json(
    { success: false, error: deniedMessage },
    { status }
  );
};

export const requireApiPermission = ({
  request,
  permission,
  brandId,
  missingBrandMessage = "ไม่พบแบรนด์",
  deniedMessage = "ไม่มีสิทธิ์ทำรายการนี้",
} = {}) => {
  const user = getSessionUserFromRequest(request);
  if (!user) {
    return {
      response: Response.json(
        { success: false, error: "กรุณาเข้าสู่ระบบ" },
        { status: 401 }
      ),
    };
  }

  const brand = normalizeBrand(brandId);
  if (brandId !== undefined && !brand) {
    return {
      response: Response.json(
        { success: false, error: missingBrandMessage },
        { status: 400 }
      ),
    };
  }

  if (brand && !canAccessBrand(user, brand)) {
    return {
      response: permissionDeniedResponse({
        request,
        user,
        brand,
        permission: "brand.access",
        deniedMessage,
      }),
    };
  }

  if (permission && !can(user, permission, { brandId: brand || undefined })) {
    return {
      response: permissionDeniedResponse({
        request,
        user,
        brand,
        permission,
        deniedMessage,
      }),
    };
  }

  return { user, brand };
};

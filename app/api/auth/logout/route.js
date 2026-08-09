import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import {
  AUTH_SESSION_COOKIE,
  getExpiredSessionCookieOptions,
} from "@/lib/auth";
import { getSessionUserFromRequest } from "@/lib/server-auth";
import { rejectCrossSiteRequest } from "@/lib/security";

export const runtime = "nodejs";

const clearSession = () => {
  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_SESSION_COOKIE, "", getExpiredSessionCookieOptions());
  return response;
};

export async function POST(request) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;
  const user = getSessionUserFromRequest(request);
  await writeAuditLog({
    request,
    user,
    brand: user?.brands?.[0] || "",
    action: "LOGOUT",
    resourceType: "auth",
    result: "success",
  });
  return clearSession();
}

export async function GET(request) {
  const user = getSessionUserFromRequest(request);
  await writeAuditLog({
    request,
    user,
    brand: user?.brands?.[0] || "",
    action: "LOGOUT",
    resourceType: "auth",
    result: "success",
  });
  return clearSession();
}

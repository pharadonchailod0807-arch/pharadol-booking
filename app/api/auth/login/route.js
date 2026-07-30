import { NextResponse } from "next/server";
import {
  AUTH_LOGIN_ERROR,
  createAuthSuccessResponse,
  findPasswordAccount,
  getPublicAdminUsers,
  getSessionUserFromAccount,
  persistentRateLimit,
} from "@/lib/auth";
import {
  getClientIp,
  rejectCrossSiteRequest,
  sanitizeText,
} from "@/lib/security";

export const runtime = "nodejs";

const LOGIN_RATE_LIMIT_MESSAGE =
  "มีการเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";

export async function POST(request) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const payload = await request.json().catch(() => ({}));
  const identifier = sanitizeText(payload?.identifier || payload?.username, 180);
  const password = String(payload?.password || "");
  const redirectTo = sanitizeText(payload?.redirectTo, 500);
  const ip = getClientIp(request);

  const ipLimited = await persistentRateLimit({
    request,
    key: `login-ip:${ip}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
    message: LOGIN_RATE_LIMIT_MESSAGE,
  });
  if (ipLimited) return ipLimited;

  if (identifier) {
    const accountLimited = await persistentRateLimit({
      request,
      key: `login-account:${identifier.toLowerCase()}`,
      limit: 8,
      windowMs: 10 * 60 * 1000,
      message: LOGIN_RATE_LIMIT_MESSAGE,
    });
    if (accountLimited) return accountLimited;
  }

  if (!identifier || !password) {
    return NextResponse.json(
      { success: false, error: AUTH_LOGIN_ERROR },
      { status: 401 }
    );
  }

  const account = await findPasswordAccount(identifier, password);

  if (!account) {
    return NextResponse.json(
      { success: false, error: AUTH_LOGIN_ERROR },
      { status: 401 }
    );
  }

  const sessionUser = getSessionUserFromAccount(account);

  if (sessionUser.role !== "ADMIN" && sessionUser.brands.length !== 1) {
    return NextResponse.json(
      { success: false, error: "บัญชีนี้ต้องได้รับสิทธิ์เพียงหนึ่งแบรนด์เท่านั้น" },
      { status: 403 }
    );
  }

  return createAuthSuccessResponse({
    sessionUser,
    redirectTo,
    users: await getPublicAdminUsers(),
  });
}

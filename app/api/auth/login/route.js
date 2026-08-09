import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import {
  AUTH_LOGIN_ERROR,
  createAuthSuccessResponse,
  findPasswordAccountWithUsers,
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
const shouldLogAuthTiming = () => process.env.NODE_ENV !== "production";

const getElapsedMs = (startedAt) =>
  Math.round((performance.now() - startedAt) * 10) / 10;

const logLoginTiming = (timing) => {
  if (!shouldLogAuthTiming()) return;
  console.info("[auth:login:timing]", timing);
};

export async function POST(request) {
  const startedAt = performance.now();
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const parseStartedAt = performance.now();
  const payload = await request.json().catch(() => ({}));
  const identifier = sanitizeText(payload?.identifier || payload?.username, 180);
  const password = String(payload?.password || "");
  const redirectTo = sanitizeText(payload?.redirectTo, 500);
  const ip = getClientIp(request);
  const parseMs = getElapsedMs(parseStartedAt);

  const rateLimitStartedAt = performance.now();
  const [ipLimited, accountLimited] = await Promise.all([
    persistentRateLimit({
      request,
      key: `login-ip:${ip}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: LOGIN_RATE_LIMIT_MESSAGE,
    }),
    identifier
      ? persistentRateLimit({
          request,
          key: `login-account:${identifier.toLowerCase()}`,
          limit: 8,
          windowMs: 10 * 60 * 1000,
          message: LOGIN_RATE_LIMIT_MESSAGE,
        })
      : Promise.resolve(null),
  ]);
  const rateLimitMs = getElapsedMs(rateLimitStartedAt);

  if (ipLimited) return ipLimited;
  if (accountLimited) return accountLimited;

  if (!identifier || !password) {
    logLoginTiming({
      result: "missing_credentials",
      parseMs,
      rateLimitMs,
      totalMs: getElapsedMs(startedAt),
    });
    await writeAuditLog({
      request,
      action: "LOGIN_FAILED",
      resourceType: "auth",
      result: "failure",
      metadata: { reason: "missing_credentials" },
    });
    return NextResponse.json(
      { success: false, error: AUTH_LOGIN_ERROR },
      { status: 401 }
    );
  }

  const lookupStartedAt = performance.now();
  const { account, publicUsers } = await findPasswordAccountWithUsers(
    identifier,
    password
  );
  const lookupMs = getElapsedMs(lookupStartedAt);

  if (!account) {
    logLoginTiming({
      result: "invalid_credentials",
      parseMs,
      rateLimitMs,
      lookupMs,
      totalMs: getElapsedMs(startedAt),
    });
    await writeAuditLog({
      request,
      action: "LOGIN_FAILED",
      resourceType: "auth",
      result: "failure",
      metadata: { reason: "invalid_credentials", identifierPresent: Boolean(identifier) },
    });
    return NextResponse.json(
      { success: false, error: AUTH_LOGIN_ERROR },
      { status: 401 }
    );
  }

  const sessionUser = getSessionUserFromAccount(account);

  if (sessionUser.role !== "ADMIN" && sessionUser.brands.length !== 1) {
    logLoginTiming({
      result: "invalid_brand_count",
      parseMs,
      rateLimitMs,
      lookupMs,
      totalMs: getElapsedMs(startedAt),
    });
    await writeAuditLog({
      request,
      user: sessionUser,
      action: "LOGIN_FAILED",
      resourceType: "auth",
      result: "failure",
      metadata: { reason: "invalid_brand_count" },
    });
    return NextResponse.json(
      { success: false, error: "บัญชีนี้ต้องได้รับสิทธิ์เพียงหนึ่งแบรนด์เท่านั้น" },
      { status: 403 }
    );
  }

  const responseStartedAt = performance.now();
  const response = createAuthSuccessResponse({
    sessionUser,
    redirectTo,
    users: publicUsers,
  });
  await writeAuditLog({
    request,
    user: sessionUser,
    brand: sessionUser.brands?.[0] || "",
    action: "LOGIN_SUCCESS",
    resourceType: "auth",
    result: "success",
  });
  logLoginTiming({
    result: "success",
    parseMs,
    rateLimitMs,
    lookupMs,
    responseMs: getElapsedMs(responseStartedAt),
    totalMs: getElapsedMs(startedAt),
  });
  return response;
}

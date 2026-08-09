import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  getActiveBrandForUser,
  getDefaultRedirectForUser,
  getPublicAdminUsers,
  verifySessionToken,
} from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/security";

export const runtime = "nodejs";

const shouldLogAuthTiming = () => process.env.NODE_ENV !== "production";
const getElapsedMs = (startedAt) =>
  Math.round((performance.now() - startedAt) * 10) / 10;

export async function GET(request) {
  const startedAt = performance.now();
  const limited = rateLimit({
    key: `auth-session:${getClientIp(request)}`,
    limit: 120,
    windowMs: 60_000,
    message: "ตรวจสอบ session บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  });
  if (limited) return limited;

  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value || "";
  const user = verifySessionToken(token);

  if (!user) {
    if (shouldLogAuthTiming()) {
      console.info("[auth:session:timing]", {
        result: "unauthorized",
        totalMs: getElapsedMs(startedAt),
      });
    }
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const includeUsers =
    request.nextUrl?.searchParams?.get("includeUsers") === "1";
  const usersStartedAt = performance.now();
  const users = includeUsers ? await getPublicAdminUsers() : undefined;
  const usersMs = includeUsers ? getElapsedMs(usersStartedAt) : 0;

  if (shouldLogAuthTiming()) {
    console.info("[auth:session:timing]", {
      result: "success",
      includeUsers,
      usersMs,
      totalMs: getElapsedMs(startedAt),
    });
  }

  return NextResponse.json({
    success: true,
    user,
    activeBrand: getActiveBrandForUser(user),
    redirectTo: getDefaultRedirectForUser(user),
    ...(includeUsers ? { users } : {}),
  });
}

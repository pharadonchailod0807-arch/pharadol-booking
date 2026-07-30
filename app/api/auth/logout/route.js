import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  getExpiredSessionCookieOptions,
} from "@/lib/auth";
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
  return clearSession();
}

export async function GET() {
  return clearSession();
}

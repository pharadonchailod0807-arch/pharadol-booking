import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  createSignedPayload,
  getProviderFlags,
  getSafeRedirectPath,
  persistentRateLimit,
} from "@/lib/auth";
import { getClientIp } from "@/lib/security";

export const runtime = "nodejs";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const GOOGLE_SCOPES = ["openid", "email", "profile"];

const getBaseUrl = (requestUrl) => {
  const envBaseUrl = String(process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");
  return envBaseUrl || `${requestUrl.protocol}//${requestUrl.host}`;
};

const getRedirectUri = (requestUrl) => {
  const explicitRedirectUri = String(process.env.GOOGLE_REDIRECT_URI_AUTH || "").trim();
  if (explicitRedirectUri) return explicitRedirectUri;
  return `${getBaseUrl(requestUrl)}/api/auth/google/callback`;
};

export async function GET(request) {
  if (!getProviderFlags().google) {
    return NextResponse.json(
      { success: false, error: "Google Login ยังไม่เปิดใช้งาน" },
      { status: 404 }
    );
  }

  const requestUrl = new URL(request.url);
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const redirectUri = getRedirectUri(requestUrl);
  const redirectTo = getSafeRedirectPath(
    requestUrl.searchParams.get("next"),
    "/admin"
  );

  const limited = await persistentRateLimit({
    request,
    key: `google-login-start:${getClientIp(request)}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
    message: "เริ่มเข้าสู่ระบบด้วย Google บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  });
  if (limited) return limited;

  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { success: false, error: "Google Login ยังตั้งค่าไม่ครบ" },
      { status: 503 }
    );
  }

  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = createSignedPayload(
    {
      type: "oauth-state",
      provider: "google",
      nonce,
      redirectTo,
    },
    OAUTH_STATE_MAX_AGE_SECONDS
  );
  const authUrl = new URL(GOOGLE_AUTH_URL);

  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });

  return response;
}

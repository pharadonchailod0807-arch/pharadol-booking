import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  createSessionToken,
  findAllowedOAuthAccount,
  getDefaultRedirectForUser,
  getProviderFlags,
  getSessionUserFromAccount,
  getSessionCookieOptions,
  getSafeRedirectPath,
  verifySignedPayload,
} from "@/lib/auth";

export const runtime = "nodejs";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";

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

const redirectToLogin = (requestUrl, params = {}) => {
  const loginUrl = new URL("/login", requestUrl.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value) loginUrl.searchParams.set(key, value);
  });
  return NextResponse.redirect(loginUrl);
};

export async function GET(request) {
  const requestUrl = new URL(request.url);

  if (!getProviderFlags().google) {
    return redirectToLogin(requestUrl, { error: "oauth_disabled" });
  }

  const error = requestUrl.searchParams.get("error");
  if (error) {
    return redirectToLogin(requestUrl, { error: "oauth_failed" });
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value || "";
  const statePayload = verifySignedPayload(state);

  if (
    !code ||
    !state ||
    !storedState ||
    state !== storedState ||
    statePayload?.type !== "oauth-state" ||
    statePayload?.provider !== "google"
  ) {
    return redirectToLogin(requestUrl, { error: "oauth_state" });
  }

  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = getRedirectUri(requestUrl);

  if (!clientId || !clientSecret) {
    return redirectToLogin(requestUrl, { error: "oauth_config" });
  }

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenPayload = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || !tokenPayload.id_token) {
      throw new Error("Cannot exchange Google authorization code");
    }

    const tokenInfoResponse = await fetch(
      `${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(tokenPayload.id_token)}`,
      { cache: "no-store" }
    );
    const tokenInfo = await tokenInfoResponse.json().catch(() => ({}));

    if (
      !tokenInfoResponse.ok ||
      tokenInfo.aud !== clientId ||
      tokenInfo.email_verified !== "true" ||
      !tokenInfo.email ||
      tokenInfo.nonce !== statePayload.nonce
    ) {
      throw new Error("Google identity verification failed");
    }

    const account = await findAllowedOAuthAccount({ email: tokenInfo.email });

    if (!account) {
      return redirectToLogin(requestUrl, {
        error: "oauth_not_allowed",
        next: getSafeRedirectPath(statePayload.redirectTo, ""),
      });
    }

    const sessionUser = getSessionUserFromAccount(account);
    const finalRedirect = getSafeRedirectPath(
      statePayload.redirectTo,
      getDefaultRedirectForUser(sessionUser)
    );
    const loginSyncUrl = new URL("/login", requestUrl.origin);
    loginSyncUrl.searchParams.set("oauth", "success");
    loginSyncUrl.searchParams.set("next", finalRedirect);
    const response = NextResponse.redirect(loginSyncUrl);

    response.cookies.set(
      AUTH_SESSION_COOKIE,
      createSessionToken(sessionUser),
      getSessionCookieOptions()
    );
    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (callbackError) {
    console.error("Google login failed", callbackError?.message || "unknown error");
    return redirectToLogin(requestUrl, { error: "oauth_failed" });
  }
}

import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  createSessionToken,
  createSignedPayload,
  findLinkedOrAllowedOAuthAccount,
  getDefaultRedirectForUser,
  getProviderFlags,
  getSafeRedirectPath,
  getSessionCookieOptions,
  getSessionUserFromAccount,
  persistentRateLimit,
  verifySignedPayload,
} from "@/lib/auth";
import { getClientIp } from "@/lib/security";

export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const FACEBOOK_AUTH_URL = "https://www.facebook.com/v20.0/dialog/oauth";
const FACEBOOK_TOKEN_URL = "https://graph.facebook.com/v20.0/oauth/access_token";
const FACEBOOK_PROFILE_URL = "https://graph.facebook.com/me";
const APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const LINE_AUTH_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_VERIFY_TOKEN_URL = "https://api.line.me/oauth2/v2.1/verify";

const OAUTH_PROVIDERS = [
  {
    key: "google",
    label: "ดำเนินการต่อด้วยบัญชี Google",
    href: "/api/auth/google",
    scopes: ["openid", "email", "profile"],
  },
  {
    key: "line",
    label: "ดำเนินการต่อด้วย LINE",
    href: "/api/auth/line",
    scopes: ["openid", "profile", "email"],
  },
  {
    key: "passkey",
    label: "เข้าสู่ระบบด้วยพาสคีย์",
    href: "",
    scopes: [],
  },
  {
    key: "facebook",
    label: "ดำเนินการต่อด้วย Facebook",
    href: "/api/auth/facebook",
    scopes: ["email"],
  },
  {
    key: "apple",
    label: "ดำเนินการต่อด้วย Apple",
    href: "/api/auth/apple",
    scopes: ["email", "name"],
  },
];

const getEnv = (...names) => {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
};

const toBase64UrlJson = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const decodeBase64UrlJson = (value) => {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const getBaseUrl = (requestUrl) => {
  const envBaseUrl = getEnv("AUTH_URL", "NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
  return envBaseUrl || `${requestUrl.protocol}//${requestUrl.host}`;
};

const getRedirectUri = (requestUrl, provider) => {
  const envName = `${provider.toUpperCase()}_REDIRECT_URI_AUTH`;
  const explicitRedirectUri = getEnv(envName);
  if (explicitRedirectUri) return explicitRedirectUri;
  return `${getBaseUrl(requestUrl)}/api/auth/${provider}/callback`;
};

const getProviderConfig = (provider, requestUrl) => {
  if (provider === "google") {
    return {
      clientId: getEnv("GOOGLE_CLIENT_ID", "PHARADOL_GOOGLE_CLIENT_ID"),
      clientSecret: getEnv("GOOGLE_CLIENT_SECRET", "PHARADOL_GOOGLE_CLIENT_SECRET"),
      redirectUri: getRedirectUri(requestUrl, "google"),
    };
  }

  if (provider === "facebook") {
    return {
      clientId: getEnv("FACEBOOK_CLIENT_ID"),
      clientSecret: getEnv("FACEBOOK_CLIENT_SECRET"),
      redirectUri: getRedirectUri(requestUrl, "facebook"),
    };
  }

  if (provider === "apple") {
    return {
      clientId: getEnv("APPLE_CLIENT_ID"),
      teamId: getEnv("APPLE_TEAM_ID"),
      keyId: getEnv("APPLE_KEY_ID"),
      privateKey: getEnv("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      redirectUri: getRedirectUri(requestUrl, "apple"),
    };
  }

  if (provider === "line") {
    return {
      clientId: getEnv("LINE_CHANNEL_ID", "LINE_CLIENT_ID"),
      clientSecret: getEnv("LINE_CHANNEL_SECRET", "LINE_CLIENT_SECRET"),
      redirectUri: getRedirectUri(requestUrl, "line"),
    };
  }

  return {};
};

const isProviderConfigured = (provider, requestUrl) => {
  const config = getProviderConfig(provider, requestUrl);

  if (provider === "google" || provider === "facebook" || provider === "line") {
    return Boolean(config.clientId && config.clientSecret && config.redirectUri);
  }

  if (provider === "apple") {
    return Boolean(
      config.clientId &&
        config.teamId &&
        config.keyId &&
        config.privateKey &&
        config.redirectUri
    );
  }

  return false;
};

const isProviderEnabled = (provider) => {
  const flags = getProviderFlags();
  if (provider === "passkey" || provider === "facebook" || provider === "apple") {
    return false;
  }
  return flags[provider] === true;
};

export const getReadyLoginProviders = async (requestUrl) =>
  OAUTH_PROVIDERS.filter(
    (provider) =>
      provider.key === "google" &&
      provider.href &&
      isProviderEnabled(provider.key) &&
      isProviderConfigured(provider.key, requestUrl)
  ).map(({ key, label, href }) => ({ key, label, href }));

const getOAuthCookieOptions = (maxAge = OAUTH_STATE_MAX_AGE_SECONDS) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge,
});

export const redirectToLogin = (requestUrl, params = {}) => {
  const loginUrl = new URL("/login", requestUrl.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value) loginUrl.searchParams.set(key, value);
  });
  return NextResponse.redirect(loginUrl);
};

const redirectToProvider = ({ provider, authUrl, clientId, redirectUri, scopes, state, nonce }) => {
  const url = new URL(authUrl);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);

  if (provider === "google" || provider === "apple" || provider === "line") {
    url.searchParams.set("nonce", nonce);
  }

  if (provider === "google") {
    url.searchParams.set("prompt", "select_account");
  } else if (provider === "apple") {
    url.searchParams.set("response_mode", "query");
  }

  return url;
};

export const startOAuthLogin = async (request, provider) => {
  const requestUrl = new URL(request.url);

  if (!isProviderEnabled(provider)) {
    return NextResponse.json(
      { success: false, error: "ยังไม่เปิดใช้งานผู้ให้บริการนี้" },
      { status: 404 }
    );
  }

  const definition = OAUTH_PROVIDERS.find((item) => item.key === provider);
  if (!definition || !definition.href) {
    return NextResponse.json(
      { success: false, error: "ยังไม่รองรับผู้ให้บริการนี้" },
      { status: 404 }
    );
  }

  const limited = await persistentRateLimit({
    request,
    key: `${provider}-oauth-start:${getClientIp(request)}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
    message: "เริ่มเข้าสู่ระบบด้วยผู้ให้บริการนี้บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  });
  if (limited) return limited;

  if (!isProviderConfigured(provider, requestUrl)) {
    return NextResponse.json(
      { success: false, error: "ยังตั้งค่าผู้ให้บริการนี้ไม่ครบ" },
      { status: 503 }
    );
  }

  const config = getProviderConfig(provider, requestUrl);
  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = createSignedPayload(
    {
      type: "oauth-state",
      provider,
      nonce,
      redirectTo: getSafeRedirectPath(requestUrl.searchParams.get("next"), "/admin"),
    },
    OAUTH_STATE_MAX_AGE_SECONDS
  );
  const authUrlByProvider = {
    google: GOOGLE_AUTH_URL,
    facebook: FACEBOOK_AUTH_URL,
    apple: APPLE_AUTH_URL,
    line: LINE_AUTH_URL,
  };
  const authUrl = redirectToProvider({
    provider,
    authUrl: authUrlByProvider[provider],
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scopes: definition.scopes,
    state,
    nonce,
  });
  const response = NextResponse.redirect(authUrl);

  response.cookies.set(OAUTH_STATE_COOKIE, state, getOAuthCookieOptions());

  return response;
};

const exchangeOAuthCode = async ({ provider, code, config }) => {
  const tokenUrlByProvider = {
    google: GOOGLE_TOKEN_URL,
    facebook: FACEBOOK_TOKEN_URL,
    apple: APPLE_TOKEN_URL,
    line: LINE_TOKEN_URL,
  };
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  if (provider === "apple") {
    body.set("client_secret", createAppleClientSecret(config));
  } else {
    body.set("client_secret", config.clientSecret);
  }

  const response = await fetch(tokenUrlByProvider[provider], {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${provider} token exchange failed`);
  }

  return payload;
};

const createAppleClientSecret = ({ clientId, teamId, keyId, privateKey }) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 60,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };
  const signingInput = `${toBase64UrlJson(header)}.${toBase64UrlJson(payload)}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
};

const getJwtParts = (jwt) => {
  const [encodedHeader, encodedPayload, encodedSignature] = String(jwt || "").split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
  return {
    encodedHeader,
    encodedPayload,
    encodedSignature,
    header: decodeBase64UrlJson(encodedHeader),
    payload: decodeBase64UrlJson(encodedPayload),
  };
};

const verifyJwtWithJwks = async ({ jwt, jwksUrl, issuer, audience }) => {
  const parts = getJwtParts(jwt);
  if (!parts?.header || !parts?.payload) return null;

  const jwksResponse = await fetch(jwksUrl, { cache: "no-store" });
  const jwks = await jwksResponse.json().catch(() => ({}));
  const jwk = Array.isArray(jwks.keys)
    ? jwks.keys.find((key) => key.kid === parts.header.kid)
    : null;

  if (!jwksResponse.ok || !jwk || parts.header.alg !== "RS256") return null;

  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const verified = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${parts.encodedHeader}.${parts.encodedPayload}`),
    publicKey,
    Buffer.from(parts.encodedSignature, "base64url")
  );
  const now = Math.floor(Date.now() / 1000);

  if (
    !verified ||
    parts.payload.iss !== issuer ||
    parts.payload.aud !== audience ||
    Number(parts.payload.exp || 0) < now
  ) {
    return null;
  }

  return parts.payload;
};

const getGoogleIdentity = async ({ tokenPayload, clientId, nonce }) => {
  if (!tokenPayload.id_token) throw new Error("Missing Google id_token");

  const response = await fetch(
    `${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(tokenPayload.id_token)}`,
    { cache: "no-store" }
  );
  const payload = await response.json().catch(() => ({}));

  if (
    !response.ok ||
    payload.aud !== clientId ||
    payload.email_verified !== "true" ||
    payload.nonce !== nonce ||
    !payload.email ||
    !payload.sub
  ) {
    throw new Error("Google identity verification failed");
  }

  return {
    provider: "google",
    providerAccountId: payload.sub,
    email: payload.email,
    emailVerified: true,
  };
};

const getFacebookIdentity = async ({ tokenPayload }) => {
  if (!tokenPayload.access_token) throw new Error("Missing Facebook access token");

  const profileUrl = new URL(FACEBOOK_PROFILE_URL);
  profileUrl.searchParams.set("fields", "id,email");
  profileUrl.searchParams.set("access_token", tokenPayload.access_token);

  const response = await fetch(profileUrl, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.id) {
    throw new Error("Facebook identity verification failed");
  }

  return {
    provider: "facebook",
    providerAccountId: payload.id,
    email: payload.email || "",
    emailVerified: false,
  };
};

const getAppleIdentity = async ({ tokenPayload, clientId, nonce }) => {
  if (!tokenPayload.id_token) throw new Error("Missing Apple id_token");

  const payload = await verifyJwtWithJwks({
    jwt: tokenPayload.id_token,
    jwksUrl: APPLE_JWKS_URL,
    issuer: "https://appleid.apple.com",
    audience: clientId,
  });
  const emailVerified = payload?.email_verified === true || payload?.email_verified === "true";

  if (!payload?.sub || payload.nonce !== nonce) {
    throw new Error("Apple identity verification failed");
  }

  return {
    provider: "apple",
    providerAccountId: payload.sub,
    email: payload.email || "",
    emailVerified,
  };
};

const getLineIdentity = async ({ tokenPayload, clientId, nonce }) => {
  if (!tokenPayload.id_token) throw new Error("Missing LINE id_token");

  const response = await fetch(LINE_VERIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: tokenPayload.id_token,
      client_id: clientId,
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.aud !== clientId || payload.nonce !== nonce || !payload.sub) {
    throw new Error("LINE identity verification failed");
  }

  return {
    provider: "line",
    providerAccountId: payload.sub,
    email: payload.email || "",
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
  };
};

const getProviderIdentity = async ({ provider, tokenPayload, config, nonce }) => {
  if (provider === "google") {
    return getGoogleIdentity({ tokenPayload, clientId: config.clientId, nonce });
  }
  if (provider === "facebook") return getFacebookIdentity({ tokenPayload });
  if (provider === "apple") {
    return getAppleIdentity({ tokenPayload, clientId: config.clientId, nonce });
  }
  if (provider === "line") {
    return getLineIdentity({ tokenPayload, clientId: config.clientId, nonce });
  }
  throw new Error("Unsupported provider");
};

const getCallbackParams = async (request) => {
  if (request.method === "POST") {
    const formData = await request.formData();
    return {
      code: String(formData.get("code") || ""),
      state: String(formData.get("state") || ""),
      error: String(formData.get("error") || ""),
    };
  }

  const requestUrl = new URL(request.url);
  return {
    code: requestUrl.searchParams.get("code") || "",
    state: requestUrl.searchParams.get("state") || "",
    error: requestUrl.searchParams.get("error") || "",
  };
};

export const completeOAuthLogin = async (request, provider) => {
  const requestUrl = new URL(request.url);

  if (!isProviderEnabled(provider)) {
    return redirectToLogin(requestUrl, { error: "oauth_disabled" });
  }

  const { code, state, error } = await getCallbackParams(request);
  if (error) {
    return redirectToLogin(requestUrl, { error: "oauth_failed" });
  }

  const limited = await persistentRateLimit({
    request,
    key: `${provider}-oauth-callback:${getClientIp(request)}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
    message: "ตรวจสอบ OAuth บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  });
  if (limited) return limited;

  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value || "";
  const statePayload = verifySignedPayload(state);

  if (
    !code ||
    !state ||
    !storedState ||
    state !== storedState ||
    statePayload?.type !== "oauth-state" ||
    statePayload?.provider !== provider
  ) {
    return redirectToLogin(requestUrl, { error: "oauth_state" });
  }

  if (!isProviderConfigured(provider, requestUrl)) {
    return redirectToLogin(requestUrl, { error: "oauth_config" });
  }

  try {
    const config = getProviderConfig(provider, requestUrl);
    const tokenPayload = await exchangeOAuthCode({ provider, code, config });
    const identity = await getProviderIdentity({
      provider,
      tokenPayload,
      config,
      nonce: statePayload.nonce,
    });
    const account = await findLinkedOrAllowedOAuthAccount(identity);

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
    response.cookies.set(OAUTH_STATE_COOKIE, "", getOAuthCookieOptions(0));

    return response;
  } catch (callbackError) {
    console.error(`${provider} login failed`, callbackError?.message || "unknown error");
    return redirectToLogin(requestUrl, { error: "oauth_failed" });
  }
};

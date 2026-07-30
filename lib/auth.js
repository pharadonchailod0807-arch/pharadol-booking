import crypto from "crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/security";

export const AUTH_SESSION_COOKIE = "booking_session";
export const OAUTH_STATE_COOKIE = "booking_oauth_state";
export const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 60;
export const AUTH_LOGIN_ERROR = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
export const AUTH_NOT_ALLOWED_ERROR = "บัญชีนี้ไม่ได้รับอนุญาตให้เข้าใช้งานระบบ";

const ADMIN_USERS_TABLE = "admin_users";
const RATE_LIMIT_TABLE = "auth_login_attempts";
const AUTH_PROVIDER_ACCOUNTS_TABLE = "auth_provider_accounts";
const ADMIN_USERNAME_ALIASES = ["admin", "super admin"];
const VALID_BRANDS = new Set(["adisorn", "pharadol"]);
const DEFAULT_ACCOUNTS = [
  {
    id: "admin-1",
    name: "ผู้ดูแลระบบ",
    username: "Admin",
    password: "1234",
    role: "ADMIN",
    brands: ["adisorn", "pharadol"],
    active: true,
  },
  {
    id: "pharadol-1",
    name: "PHARADOL PRODUCTION",
    username: "pharadol",
    password: "1234",
    role: "STAFF",
    brands: ["pharadol"],
    active: true,
  },
  {
    id: "adisorn-1",
    name: "Adisorn Wedding Studio",
    username: "adisorn",
    password: "1234",
    role: "STAFF",
    brands: ["adisorn"],
    active: true,
  },
];

const normalizeIdentifier = (value) =>
  String(value || "").trim().toLowerCase().slice(0, 180);

const normalizeBrands = (brands, role) =>
  role === "ADMIN" || role === "super_admin"
    ? ["adisorn", "pharadol"]
    : Array.isArray(brands)
      ? brands
          .map((brand) => (brand === "pharadon" ? "pharadol" : brand))
          .filter((brand) => VALID_BRANDS.has(brand))
      : [];

const normalizeAccount = (account = {}) => ({
  id: String(account.id || "").trim(),
  name: String(account.name || "").trim(),
  username: String(account.username || "").trim(),
  email: String(account.email || "").trim().toLowerCase(),
  phone: String(account.phone || "").trim(),
  password: String(account.password || ""),
  role: account.role === "super_admin" ? "ADMIN" : String(account.role || "STAFF"),
  brands: normalizeBrands(account.brands, account.role),
  active:
    typeof account.active === "boolean"
      ? account.active
      : typeof account.isActive === "boolean"
        ? account.isActive
        : true,
});

export const getSafeRedirectPath = (value, fallback = "") => {
  const rawValue = String(value || "").trim();
  if (!rawValue || !rawValue.startsWith("/") || rawValue.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(rawValue, "https://local.invalid");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
};

export const getProviderFlags = () => ({
  google: process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED === "true",
  passkey: process.env.NEXT_PUBLIC_PASSKEY_LOGIN_ENABLED === "true",
  line: process.env.NEXT_PUBLIC_LINE_LOGIN_ENABLED === "true",
  apple: process.env.NEXT_PUBLIC_APPLE_LOGIN_ENABLED === "true",
  facebook: process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED === "true",
  sms: process.env.NEXT_PUBLIC_SMS_LOGIN_ENABLED === "true",
  passwordReset: process.env.NEXT_PUBLIC_PASSWORD_RESET_ENABLED === "true",
});

const getAuthSecret = () =>
  process.env.AUTH_SECRET ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "local-development-session-secret";

const toBase64Url = (value) =>
  Buffer.from(value).toString("base64url");

const fromBase64Url = (value) =>
  Buffer.from(value, "base64url").toString("utf8");

const sign = (value) =>
  crypto.createHmac("sha256", getAuthSecret()).update(value).digest("base64url");

export const createSignedPayload = (payload, maxAgeSeconds) => {
  const now = Math.floor(Date.now() / 1000);
  const body = toBase64Url(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + maxAgeSeconds,
    })
  );

  return `${body}.${sign(body)}`;
};

export const verifySignedPayload = (token) => {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;

  const expectedSignature = sign(body);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body));
    if (!payload?.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

export const getSessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
});

export const getExpiredSessionCookieOptions = () => ({
  ...getSessionCookieOptions(),
  maxAge: 0,
});

export const getSessionUserFromAccount = (account) => ({
  id: account.id,
  name: account.name,
  username: account.username,
  email: account.email || "",
  role: account.role,
  brands: account.brands,
  active: account.active,
  loggedInAt: new Date().toISOString(),
});

export const getDefaultRedirectForUser = (sessionUser) => {
  if (sessionUser.role === "ADMIN") return "/admin";
  return sessionUser.brands.length === 1 ? `/${sessionUser.brands[0]}/welcome` : "/login";
};

export const createSessionToken = (sessionUser) =>
  createSignedPayload(
    {
      type: "session",
      sid: crypto.randomBytes(18).toString("base64url"),
      user: sessionUser,
    },
    AUTH_SESSION_MAX_AGE_SECONDS
  );

export const verifySessionToken = (token) => {
  const payload = verifySignedPayload(token);
  return payload?.type === "session" ? payload.user : null;
};

export const loadAdminUsers = async () => {
  try {
    const { data, error } = await supabase
      .from(ADMIN_USERS_TABLE)
      .select("*")
      .order("username", { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(normalizeAccount);
    }
  } catch {
    // Fall back to the legacy local defaults below.
  }

  return DEFAULT_ACCOUNTS.map(normalizeAccount);
};

export const getPublicAdminUsers = async () => {
  const users = await loadAdminUsers();
  return users.map(({ password, ...user }) => user);
};

export const findPasswordAccount = async (identifier, password) => {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const rawPassword = String(password || "");
  if (!normalizedIdentifier || !rawPassword) return null;

  const users = await loadAdminUsers();
  return (
    users.find((user) => {
      const username = normalizeIdentifier(user.username);
      const email = normalizeIdentifier(user.email);
      const adminAliasAllowed =
        user.id === "admin-1" && ADMIN_USERNAME_ALIASES.includes(normalizedIdentifier);

      return (
        user.active === true &&
        String(user.password || "") === rawPassword &&
        (username === normalizedIdentifier ||
          email === normalizedIdentifier ||
          adminAliasAllowed)
      );
    }) || null
  );
};

export const findAllowedOAuthAccount = async ({ email }) => {
  const normalizedEmail = normalizeIdentifier(email);
  if (!normalizedEmail) return null;

  const users = await loadAdminUsers();
  return (
    users.find(
      (user) =>
        user.active === true &&
        (normalizeIdentifier(user.email) === normalizedEmail ||
          normalizeIdentifier(user.username) === normalizedEmail)
    ) || null
  );
};

export const isOAuthAccountLinkingReady = async () => {
  try {
    const { error } = await supabase
      .from(AUTH_PROVIDER_ACCOUNTS_TABLE)
      .select("id")
      .limit(1);

    return !error;
  } catch {
    return false;
  }
};

export const findLinkedOrAllowedOAuthAccount = async ({
  provider,
  providerAccountId,
  email,
  emailVerified = false,
}) => {
  const normalizedProvider = normalizeIdentifier(provider);
  const normalizedProviderAccountId = String(providerAccountId || "").trim();
  const normalizedEmail = normalizeIdentifier(email);

  if (!normalizedProvider || !normalizedProviderAccountId) return null;

  try {
    const { data, error } = await supabase
      .from(AUTH_PROVIDER_ACCOUNTS_TABLE)
      .select("user_id,verified_email")
      .eq("provider", normalizedProvider)
      .eq("provider_account_id", normalizedProviderAccountId)
      .maybeSingle();

    if (error) throw error;

    if (data?.user_id) {
      const users = await loadAdminUsers();
      const account =
        users.find(
          (user) =>
            user.active === true &&
            normalizeIdentifier(user.id) === normalizeIdentifier(data.user_id)
        ) || null;

      if (account) {
        await supabase
          .from(AUTH_PROVIDER_ACCOUNTS_TABLE)
          .update({ last_login_at: new Date().toISOString() })
          .eq("provider", normalizedProvider)
          .eq("provider_account_id", normalizedProviderAccountId);
        return account;
      }
    }
  } catch {
    // If the optional linking table is not available yet, fall back to verified email only.
  }

  if (!emailVerified || !normalizedEmail) return null;

  const account = await findAllowedOAuthAccount({ email: normalizedEmail });
  if (!account) return null;

  try {
    await supabase.from(AUTH_PROVIDER_ACCOUNTS_TABLE).upsert(
      {
        user_id: account.id,
        provider: normalizedProvider,
        provider_account_id: normalizedProviderAccountId,
        verified_email: normalizedEmail,
        last_login_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_account_id" }
    );
  } catch {
    // The verified allowed-user check above remains authoritative.
  }

  return account;
};

export const createAuthSuccessResponse = ({ sessionUser, redirectTo, users = [] }) => {
  const fallbackRedirect = getDefaultRedirectForUser(sessionUser);
  const safeRedirect = getSafeRedirectPath(redirectTo, fallbackRedirect);
  const response = NextResponse.json({
    success: true,
    user: sessionUser,
    activeBrand: sessionUser.role === "ADMIN" ? "admin" : sessionUser.brands[0] || "",
    redirectTo: safeRedirect,
    users,
  });

  response.cookies.set(
    AUTH_SESSION_COOKIE,
    createSessionToken(sessionUser),
    getSessionCookieOptions()
  );

  return response;
};

const hashRateLimitKey = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

export const persistentRateLimit = async ({
  request,
  key,
  limit,
  windowMs,
  message,
}) => {
  const keyHash = hashRateLimitKey(key);
  const now = new Date();
  const resetAt = new Date(Date.now() + windowMs);

  try {
    const { data, error } = await supabase
      .from(RATE_LIMIT_TABLE)
      .select("key_hash,count,reset_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (error) throw error;

    const existingResetAt = data?.reset_at ? new Date(data.reset_at) : null;
    const isFreshWindow = existingResetAt && existingResetAt > now;
    const nextCount = isFreshWindow ? Number(data.count || 0) + 1 : 1;
    const nextResetAt = isFreshWindow ? existingResetAt : resetAt;

    if (isFreshWindow && Number(data.count || 0) >= limit) {
      return NextResponse.json({ success: false, error: message }, { status: 429 });
    }

    await supabase.from(RATE_LIMIT_TABLE).upsert({
      key_hash: keyHash,
      count: nextCount,
      reset_at: nextResetAt.toISOString(),
      updated_at: now.toISOString(),
    });

    return null;
  } catch {
    return rateLimit({
      key: `${keyHash}:${request.headers.get("x-vercel-id") || "local"}`,
      limit,
      windowMs,
      message,
    });
  }
};

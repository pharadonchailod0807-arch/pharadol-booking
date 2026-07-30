"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ADMIN_USERS_KEY = "central_admin_users";
const LOGIN_USERNAME_HISTORY_KEY = "login_username_history";
const MAX_LOGIN_USERNAME_HISTORY = 8;
const GENERAL_LOGIN_ERROR = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";

const normalizeUsernameHistory = (value) => {
  const items = Array.isArray(value) ? value : [];
  const normalizedItems = [];
  const seen = new Set();

  items.forEach((item) => {
    const username = String(item || "").trim();
    const key = username.toLowerCase();

    if (!username || seen.has(key)) return;

    seen.add(key);
    normalizedItems.push(username);
  });

  return normalizedItems.slice(0, MAX_LOGIN_USERNAME_HISTORY);
};

const getSafeRedirectPath = (value, fallback = "") => {
  const rawValue = String(value || "").trim();
  if (!rawValue || !rawValue.startsWith("/") || rawValue.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(rawValue, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
};

function EyeIcon({ crossed = false }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="m4 4 16 16" />}
    </svg>
  );
}

const providerConfig = [
  {
    key: "google",
    label: "เข้าสู่ระบบด้วย Google",
    icon: "G",
    enabled: process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED === "true",
    href: "/api/auth/google",
  },
  {
    key: "passkey",
    label: "เข้าสู่ระบบด้วย Passkey",
    icon: "⌘",
    enabled: process.env.NEXT_PUBLIC_PASSKEY_LOGIN_ENABLED === "true",
  },
  {
    key: "line",
    label: "เข้าสู่ระบบด้วย LINE",
    icon: "L",
    enabled: process.env.NEXT_PUBLIC_LINE_LOGIN_ENABLED === "true",
  },
  {
    key: "apple",
    label: "เข้าสู่ระบบด้วย Apple",
    icon: "",
    enabled: process.env.NEXT_PUBLIC_APPLE_LOGIN_ENABLED === "true",
  },
  {
    key: "facebook",
    label: "เข้าสู่ระบบด้วย Facebook",
    icon: "f",
    enabled: process.env.NEXT_PUBLIC_FACEBOOK_LOGIN_ENABLED === "true",
  },
  {
    key: "sms",
    label: "เข้าสู่ระบบด้วย SMS",
    icon: "SMS",
    enabled: process.env.NEXT_PUBLIC_SMS_LOGIN_ENABLED === "true",
  },
];

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameHistory, setUsernameHistory] = useState([]);
  const [isUsernameHistoryOpen, setIsUsernameHistoryOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [redirectTo, setRedirectTo] = useState("");
  const submitLockRef = useRef(false);

  const enabledProviders = useMemo(
    () => providerConfig.filter((provider) => provider.enabled && provider.href),
    []
  );

  const completeClientSession = useCallback(
    ({ user, activeBrand, users, redirectTo: nextPath }) => {
      if (Array.isArray(users)) {
        localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users));
      }

      sessionStorage.clear();
      sessionStorage.setItem("loggedIn", "true");
      sessionStorage.setItem("currentUser", JSON.stringify(user));
      sessionStorage.setItem("lastActivity", String(Date.now()));
      sessionStorage.setItem("activeBrand", activeBrand);
      window.location.replace(
        getSafeRedirectPath(
          nextPath,
          activeBrand === "admin" ? "/admin" : `/${activeBrand}/welcome`
        )
      );
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const nextPath = getSafeRedirectPath(params.get("next"), "");
      const oauthStatus = params.get("oauth");
      const oauthError = params.get("error");

      setRedirectTo(nextPath);
      setHasPreviousPage(window.history.length > 1 && document.referrer !== "");

      try {
        const savedHistory = JSON.parse(
          localStorage.getItem(LOGIN_USERNAME_HISTORY_KEY) || "[]"
        );
        setUsernameHistory(normalizeUsernameHistory(savedHistory));
      } catch {
        setUsernameHistory([]);
      }

      if (oauthError === "oauth_not_allowed") {
        setError("บัญชีนี้ไม่ได้รับอนุญาตให้เข้าใช้งานระบบ");
      } else if (oauthError) {
        setError("เข้าสู่ระบบด้วยผู้ให้บริการนี้ไม่สำเร็จ");
      }

      if (oauthStatus === "success") {
        fetch("/api/auth/session", { cache: "no-store" })
          .then((response) => response.json())
          .then((result) => {
            if (!result?.success || !result.user) {
              throw new Error("Cannot restore OAuth session");
            }

            completeClientSession({
              user: result.user,
              activeBrand: result.activeBrand,
              users: result.users,
              redirectTo: nextPath || result.redirectTo,
            });
          })
          .catch(() => {
            setError("เข้าสู่ระบบด้วยผู้ให้บริการนี้ไม่สำเร็จ");
          });
      } else {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
        const activeBrand = sessionStorage.getItem("activeBrand");

        if (loggedIn && currentUser && activeBrand) {
          const fallback =
            currentUser.role === "ADMIN"
              ? "/admin"
              : `/${activeBrand === "admin" ? "pharadol" : activeBrand}/welcome`;
          window.location.replace(nextPath || fallback);
        }
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [completeClientSession]);

  const saveUsernameHistory = (value) => {
    const savedUsername = String(value || "").trim();
    if (!savedUsername) return;

    const nextHistory = normalizeUsernameHistory([
      savedUsername,
      ...usernameHistory.filter(
        (item) => item.toLowerCase() !== savedUsername.toLowerCase()
      ),
    ]);

    localStorage.setItem(LOGIN_USERNAME_HISTORY_KEY, JSON.stringify(nextHistory));
    setUsernameHistory(nextHistory);
  };

  const handleLogin = async (event) => {
    event.preventDefault();

    if (submitLockRef.current || isSubmitting) return;

    setError("");

    const normalizedIdentifier = identifier.trim();

    if (!normalizedIdentifier || !password) {
      setError(GENERAL_LOGIN_ERROR);
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: normalizedIdentifier,
          password,
          redirectTo,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success || !result.user) {
        throw new Error(result?.error || GENERAL_LOGIN_ERROR);
      }

      saveUsernameHistory(result.user.username || normalizedIdentifier);
      completeClientSession(result);
    } catch (loginError) {
      setError(loginError?.message || GENERAL_LOGIN_ERROR);
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleProviderLogin = (provider) => {
    if (!provider.href) return;
    const url = new URL(provider.href, window.location.origin);
    if (redirectTo) url.searchParams.set("next", redirectTo);
    window.location.assign(url.toString());
  };

  const usernameSearch = identifier.trim().toLowerCase();
  const visibleUsernameHistory = usernameHistory.filter((item) =>
    item.toLowerCase().includes(usernameSearch)
  );
  const passwordResetEnabled =
    process.env.NEXT_PUBLIC_PASSWORD_RESET_ENABLED === "true";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#07120f] text-[#10231C]">
      <div className="min-h-screen bg-[linear-gradient(135deg,#07120f_0%,#123528_52%,#07120f_100%)] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))] sm:px-8 lg:flex lg:items-center lg:justify-center lg:px-10 lg:py-10">
        <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[1140px] flex-col lg:min-h-[680px] lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <header className="flex min-h-[48px] items-center justify-between text-white lg:hidden">
            <button
              type="button"
              onClick={() => window.history.back()}
              disabled={!hasPreviousPage}
              aria-label="ย้อนกลับ"
              className="flex h-11 w-11 items-center justify-center rounded-full text-2xl font-semibold text-white transition hover:bg-white/10 disabled:invisible"
            >
              ‹
            </button>
            <h1 className="text-lg font-bold">เข้าสู่ระบบ</h1>
            <button
              type="button"
              aria-label="ช่วยเหลือ"
              onClick={() => setIsHelpOpen((current) => !current)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-base font-black text-white transition hover:bg-white/10"
            >
              ?
            </button>
          </header>

          <div className="hidden max-w-[480px] text-white lg:block">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/15 bg-white/10">
                <Image
                  src="/customer-form/pharadol-logo-transparent.png"
                  alt="Pharadol Production"
                  width={120}
                  height={48}
                  className="h-auto w-12"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#CDAE77]">
                  Pharadol Production
                </p>
                <h2 className="mt-1 text-3xl font-black">
                  Studio Booking Management
                </h2>
              </div>
            </div>
            <p className="mt-7 max-w-[430px] text-lg font-medium leading-8 text-white/72">
              พื้นที่ทำงานสำหรับจัดการใบจอง ข้อมูลลูกค้า และการทำงานของทีมอย่างปลอดภัย
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="mx-auto mt-5 w-full max-w-[500px] rounded-lg border border-white/70 bg-white px-5 py-6 shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:px-8 sm:py-8 lg:mt-0 lg:max-w-[500px]"
          >
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-lg border border-[#E8DED0] bg-[#F8F4EC]">
                <Image
                  src="/customer-form/pharadol-logo-transparent.png"
                  alt="Pharadol Production"
                  width={150}
                  height={60}
                  className="h-auto w-16"
                  priority
                />
              </div>
              <h2 className="mt-5 text-[28px] font-black leading-tight text-[#10231C]">
                เข้าสู่ระบบ
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-500">
                เข้าสู่ระบบจัดการใบจองและข้อมูลลูกค้า
              </p>
            </div>

            {isHelpOpen && (
              <div className="mt-5 rounded-lg border border-[#D9E3DC] bg-[#F5F9F6] px-4 py-3 text-sm font-medium leading-6 text-[#315245]">
                กรุณาติดต่อผู้ดูแลระบบของ Pharadol Production หากต้องการรีเซ็ตรหัสผ่านหรือขอสิทธิ์เข้าใช้งาน
              </div>
            )}

            <div className="mt-7 space-y-4">
              <div className="relative">
                <label
                  htmlFor="login-identifier"
                  className="mb-2 block text-sm font-bold text-[#10231C]"
                >
                  ชื่อผู้ใช้ อีเมล หรือเบอร์โทรศัพท์
                </label>
                <input
                  id="login-identifier"
                  name="username"
                  type="text"
                  inputMode="email"
                  value={identifier}
                  onChange={(event) => {
                    setIdentifier(event.target.value);
                    setIsUsernameHistoryOpen(true);
                    setError("");
                  }}
                  onFocus={() => setIsUsernameHistoryOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setIsUsernameHistoryOpen(false), 120);
                  }}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="h-[54px] w-full rounded-lg border border-zinc-200 bg-white px-4 text-base font-semibold text-[#10231C] outline-none transition placeholder:text-zinc-400 focus:border-[#0F3D31] focus:shadow-[0_0_0_4px_rgba(15,61,49,0.12)]"
                  aria-describedby={error ? "login-error" : undefined}
                />

                {isUsernameHistoryOpen && visibleUsernameHistory.length > 0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-lg border border-zinc-200 bg-white p-1.5 text-left shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                    {visibleUsernameHistory.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setIdentifier(item);
                          setIsUsernameHistoryOpen(false);
                          setError("");
                        }}
                        className="block w-full rounded-md px-4 py-2.5 text-left text-sm font-semibold text-zinc-700 transition hover:bg-[#F5F9F6] focus:bg-[#F5F9F6] focus:outline-none"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-bold text-[#10231C]"
                  >
                    รหัสผ่าน
                  </label>
                  {passwordResetEnabled && (
                    <a
                      href="/login/reset-password"
                      className="text-sm font-bold text-[#0F6B52] underline-offset-4 hover:underline"
                    >
                      ลืมรหัสผ่าน?
                    </a>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                    autoComplete="current-password"
                    className="h-[54px] w-full rounded-lg border border-zinc-200 bg-white px-4 pr-14 text-base font-semibold text-[#10231C] outline-none transition placeholder:text-zinc-400 focus:border-[#0F3D31] focus:shadow-[0_0_0_4px_rgba(15,61,49,0.12)]"
                    aria-describedby={error ? "login-error" : undefined}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none"
                  >
                    <EyeIcon crossed={showPassword} />
                  </button>
                </div>
              </div>

              {error && (
                <p
                  id="login-error"
                  role="alert"
                  aria-live="assertive"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-700"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="flex h-[54px] w-full items-center justify-center rounded-lg bg-[#0F3D31] px-5 text-base font-black text-white shadow-[0_14px_28px_rgba(15,61,49,0.22)] transition hover:bg-[#082E25] focus:outline-none focus:ring-4 focus:ring-[#0F3D31]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
            </div>

            {enabledProviders.length > 0 && (
              <div className="mt-7">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-zinc-200" />
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
                    หรือ
                  </span>
                  <span className="h-px flex-1 bg-zinc-200" />
                </div>

                <div className="mt-4 grid gap-3">
                  {enabledProviders.map((provider) => (
                    <button
                      key={provider.key}
                      type="button"
                      onClick={() => handleProviderLogin(provider)}
                      className="relative flex h-[52px] w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-black text-[#10231C] transition hover:border-[#0F3D31] hover:bg-[#F5F9F6] focus:outline-none focus:ring-4 focus:ring-[#0F3D31]/12"
                    >
                      <span className="absolute left-4 flex h-8 min-w-8 items-center justify-center rounded-full border border-zinc-200 px-2 text-xs font-black text-[#0F3D31]">
                        {provider.icon}
                      </span>
                      {provider.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </form>
        </section>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function ProviderIcon({ provider }) {
  if (provider === "google") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
        <path
          fill="#4285F4"
          d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.31 2.99-7.52Z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 4.96-.9 6.61-2.25l-3.23-2.51c-.9.6-2.04.95-3.38.95-2.6 0-4.81-1.76-5.6-4.12H3.06v2.6A9.99 9.99 0 0 0 12 22Z"
        />
        <path
          fill="#FBBC05"
          d="M6.4 14.07A6.02 6.02 0 0 1 6.09 12c0-.72.11-1.42.31-2.07v-2.6H3.06A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.06 4.67l3.34-2.6Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.81c1.47 0 2.79.51 3.83 1.51l2.86-2.86C16.96 2.85 14.7 2 12 2a9.99 9.99 0 0 0-8.94 5.33l3.34 2.6C7.19 7.57 9.4 5.81 12 5.81Z"
        />
      </svg>
    );
  }

  if (provider === "apple") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
        <path d="M16.37 12.2c-.03-2.16 1.76-3.21 1.84-3.26-1.01-1.48-2.58-1.68-3.12-1.7-1.33-.14-2.59.78-3.26.78-.68 0-1.7-.76-2.8-.74-1.44.02-2.77.84-3.51 2.13-1.5 2.6-.38 6.45 1.08 8.56.72 1.03 1.57 2.2 2.69 2.15 1.08-.04 1.49-.69 2.8-.69 1.3 0 1.68.69 2.82.67 1.17-.02 1.91-1.05 2.62-2.09.83-1.2 1.17-2.37 1.18-2.43-.03-.01-2.31-.88-2.34-3.38Zm-2.15-6.36c.59-.72.99-1.72.88-2.72-.85.03-1.89.57-2.5 1.29-.55.64-1.03 1.67-.9 2.65.95.08 1.92-.48 2.52-1.22Z" />
      </svg>
    );
  }

  if (provider === "line") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
        <rect width="22" height="16" x="1" y="4" fill="#06C755" rx="8" />
        <path
          fill="#fff"
          d="M6.3 9h1.3v4H10v1.1H6.3V9Zm4.4 0H12v5.1h-1.3V9Zm2.3 0h1.2l2.1 2.9V9h1.2v5.1h-1.1l-2.2-3v3H13V9Z"
        />
      </svg>
    );
  }

  if (provider === "facebook") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
        <circle cx="12" cy="12" r="10" fill="#1877F2" />
        <path
          fill="#fff"
          d="M14.77 14.9l.44-2.9h-2.78v-1.88c0-.79.39-1.57 1.64-1.57h1.27V6.08S14.19 5.89 13.1 5.89c-2.28 0-3.77 1.38-3.77 3.88V12H6.8v2.9h2.53v7.01a10.06 10.06 0 0 0 3.1 0V14.9h2.34Z"
        />
      </svg>
    );
  }

  if (provider === "phone") {
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
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </svg>
    );
  }

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
      <path d="M12 3a5 5 0 0 0-5 5v2" />
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M12 14v3" />
    </svg>
  );
}

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

function FieldIcon({ type }) {
  if (type === "lock") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-6 w-6 sm:h-7 sm:w-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6 sm:h-7 sm:w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

const SOCIAL_LOGIN_PLACEHOLDERS = [
  { key: "google", label: "ดำเนินการต่อด้วย Google" },
  { key: "apple", label: "ดำเนินการต่อด้วย Apple" },
  { key: "facebook", label: "ดำเนินการต่อด้วย Facebook" },
  { key: "phone", label: "ดำเนินการต่อด้วยเบอร์มือถือ" },
];

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameHistory, setUsernameHistory] = useState([]);
  const [isUsernameHistoryOpen, setIsUsernameHistoryOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [redirectTo, setRedirectTo] = useState("");
  const submitLockRef = useRef(false);

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

  const usernameSearch = identifier.trim().toLowerCase();
  const visibleUsernameHistory = usernameHistory.filter((item) =>
    item.toLowerCase().includes(usernameSearch)
  );
  const passwordResetEnabled =
    process.env.NEXT_PUBLIC_PASSWORD_RESET_ENABLED === "true";

  return (
    <main className="login-bg min-h-screen overflow-x-hidden bg-[#090D14] text-[#15171B]">
      <div className="login-gradient flex min-h-screen items-center justify-center px-3 py-[max(24px,env(safe-area-inset-top))] sm:px-0">
        <section className="login-shell flex min-h-[calc(100vh-48px)] w-full items-center justify-center">
          <form
            onSubmit={handleLogin}
            className="login-card w-full max-w-[720px] rounded-[26px] border border-white/75 bg-[#FCFBF8] px-6 py-7 shadow-[0_38px_120px_rgba(0,0,0,0.38),0_0_88px_rgba(201,168,106,0.18),0_1px_0_rgba(255,255,255,0.94)_inset] sm:w-[calc(100%-64px)] sm:max-w-[680px] sm:rounded-[36px] sm:px-14 sm:py-14 lg:w-full lg:min-w-[650px] lg:max-w-[720px] lg:rounded-[38px] lg:px-20 lg:py-16"
          >
            <div className="text-center">
              <p className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#B99458] sm:text-base">
                STUDIO BOOKING MANAGEMENT
              </p>
              <h2 className="mt-4 text-[34px] font-black leading-[1.02] text-[#111318] sm:text-[50px] lg:text-[54px]">
                เข้าสู่ระบบ
              </h2>
              <p className="mx-auto mt-4 max-w-[520px] text-[15px] font-medium leading-7 text-[#777B84] sm:text-[19px]">
                เข้าสู่ระบบเพื่อจัดการใบจอง ข้อมูลลูกค้า และการปฏิบัติงาน
              </p>
            </div>

            <div className="mt-9 space-y-6 sm:mt-10 sm:space-y-7">
              <div className="relative">
                <label
                  htmlFor="login-identifier"
                  className="mb-2.5 block text-[15px] font-extrabold text-[#181A1F] sm:text-[18px]"
                >
                  ชื่อผู้ใช้ / Email / เบอร์โทรศัพท์
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 items-center justify-center text-[#8B8E99] sm:left-6">
                    <FieldIcon type="user" />
                  </span>
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
                    className="h-14 w-full rounded-[18px] border border-[#DDD9D0] bg-white px-14 text-base font-semibold text-[#15171B] outline-none transition duration-200 placeholder:text-zinc-400 hover:border-[#C8B99E] hover:shadow-[0_10px_24px_rgba(15,23,42,0.05)] focus:border-[#B99458] focus:shadow-[0_0_0_4px_rgba(185,148,88,0.16)] sm:h-[74px] sm:rounded-[20px] sm:px-[64px] sm:text-lg"
                    aria-describedby={error ? "login-error" : undefined}
                  />
                </div>

                {isUsernameHistoryOpen && visibleUsernameHistory.length > 0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-[#DDD7CC] bg-white p-1.5 text-left shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
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
                        className="block w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-zinc-700 transition duration-200 hover:bg-[#F5F1E9] focus:bg-[#F5F1E9] focus:outline-none"
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
                    className="block text-[15px] font-extrabold text-[#181A1F] sm:text-[18px]"
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
                  <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 items-center justify-center text-[#8B8E99] sm:left-6">
                    <FieldIcon type="lock" />
                  </span>
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
                    className="h-14 w-full rounded-[18px] border border-[#DDD9D0] bg-white px-14 pr-14 text-base font-semibold text-[#15171B] outline-none transition duration-200 placeholder:text-zinc-400 hover:border-[#C8B99E] hover:shadow-[0_10px_24px_rgba(15,23,42,0.05)] focus:border-[#B99458] focus:shadow-[0_0_0_4px_rgba(185,148,88,0.16)] sm:h-[74px] sm:rounded-[20px] sm:px-[64px] sm:pr-20 sm:text-lg"
                    aria-describedby={error ? "login-error" : undefined}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-500 transition duration-200 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none sm:right-4"
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
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-700"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="mt-2 flex h-14 w-full items-center justify-center rounded-[18px] bg-[#151B26] px-5 text-base font-black text-white shadow-[0_16px_32px_rgba(21,27,38,0.25)] transition duration-200 hover:bg-[#0C111B] hover:shadow-[0_20px_40px_rgba(21,27,38,0.30)] active:translate-y-0 focus:outline-none focus:ring-4 focus:ring-[#B99458]/22 disabled:cursor-not-allowed disabled:opacity-60 sm:h-[74px] sm:rounded-[20px] sm:text-[20px]"
              >
                {isSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
            </div>

            <div className="mt-10">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-zinc-200" />
                <span className="text-sm font-bold text-[#8A8D96] sm:text-base">หรือ</span>
                <span className="h-px flex-1 bg-zinc-200" />
              </div>

              <div className="mt-6 grid gap-4">
                {SOCIAL_LOGIN_PLACEHOLDERS.map((provider) => (
                  <button
                    key={provider.key}
                    type="button"
                    onClick={() => {}}
                    className="relative flex h-[68px] w-full items-center justify-center rounded-[18px] border border-[#DDD9D0] bg-white px-6 text-center text-base font-extrabold text-[#15171B] shadow-[0_8px_18px_rgba(15,23,42,0.03)] transition duration-200 hover:border-[#D0C6B5] hover:bg-[#F7F7F5] hover:shadow-[0_14px_26px_rgba(15,23,42,0.07)] active:translate-y-0 focus:outline-none focus:ring-4 focus:ring-[#B99458]/14 sm:h-[72px] sm:rounded-[20px] sm:text-[19px]"
                  >
                    <span
                      className={`absolute left-5 flex h-8 w-8 items-center justify-center rounded-full bg-white sm:left-6 [&>svg]:h-7 [&>svg]:w-7 ${
                        provider.key === "facebook"
                          ? "text-[#1877F2]"
                          : provider.key === "phone"
                            ? "text-[#394150]"
                            : "text-[#111111]"
                      }`}
                    >
                      <ProviderIcon provider={provider.key} />
                    </span>
                    {provider.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-10 text-center text-[13px] font-semibold leading-[1.7] text-[#8A8D96] sm:text-base">
              <p>ระบบนี้สำหรับผู้ได้รับอนุญาตเท่านั้น</p>
              <p>ข้อมูลการเข้าสู่ระบบได้รับการปกป้องอย่างปลอดภัย</p>
            </div>
          </form>
        </section>
      </div>

      <style jsx>{`
        .login-gradient {
          background:
            linear-gradient(115deg, rgba(11, 19, 31, 0.96) 0%, rgba(18, 23, 31, 0.92) 46%, rgba(13, 32, 35, 0.94) 100%),
            linear-gradient(42deg, rgba(196, 162, 93, 0.18), rgba(74, 44, 72, 0.13) 46%, rgba(22, 84, 70, 0.16));
          background-size: 130% 130%, 120% 120%;
          animation: loginGradient 18s ease-in-out infinite alternate;
        }

        .login-card {
          animation: loginFadeIn 30ms ease-out both;
        }

        @keyframes loginGradient {
          from {
            background-position: 0% 50%, 0% 50%;
          }
          to {
            background-position: 100% 50%, 100% 50%;
          }
        }

        @keyframes loginFadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-gradient,
          .login-card {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}

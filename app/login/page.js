"use client";

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

const systemHighlights = [
  "จัดการใบจอง",
  "จัดการข้อมูลลูกค้า",
  "จัดการปฏิทินงาน",
];

function SystemIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M4 10h16M8 14h3M13 14h3M8 17h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

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
    <main className="login-bg min-h-screen overflow-x-hidden bg-[#090D14] text-[#15171B]">
      <div className="login-gradient min-h-screen px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] sm:px-8 lg:flex lg:items-center lg:justify-center lg:px-10 lg:py-8">
        <section className="login-shell mx-auto flex min-h-[calc(100vh-44px)] w-full max-w-[1160px] flex-col lg:min-h-[680px] lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-10 xl:gap-14">
          <header className="flex min-h-[46px] items-center justify-between text-white lg:hidden">
            <button
              type="button"
              onClick={() => window.history.back()}
              disabled={!hasPreviousPage}
              aria-label="ย้อนกลับ"
              className="flex h-11 w-11 items-center justify-center rounded-full text-2xl font-semibold text-white transition hover:bg-white/10 disabled:invisible"
            >
              ‹
            </button>
            <h1 className="text-center text-[15px] font-black leading-tight">
              STUDIO BOOKING
              <span className="block text-xs font-semibold text-white/62">
                MANAGEMENT
              </span>
            </h1>
            <button
              type="button"
              aria-label="ช่วยเหลือ"
              onClick={() => setIsHelpOpen((current) => !current)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-base font-black text-white transition hover:bg-white/10"
            >
              ?
            </button>
          </header>

          <aside className="brand-panel hidden text-white lg:block">
            <div className="rounded-[28px] border border-white/14 bg-[#141B25]/95 p-8 shadow-[0_34px_120px_rgba(0,0,0,0.32)] backdrop-blur-2xl xl:p-10">
              <div className="inline-flex items-center gap-3 rounded-full border border-[#C9A86A]/38 bg-[#C9A86A]/14 px-4 py-2 text-sm font-bold text-[#F0D69A]">
                <SystemIcon />
                ระบบกลางสำหรับทีมสตูดิโอ
              </div>

              <h2 className="mt-8 max-w-[560px] text-[46px] font-black leading-[1.04] text-[#F8F4EC] [text-shadow:0_10px_34px_rgba(0,0,0,0.38)] xl:text-[54px]">
                STUDIO BOOKING MANAGEMENT
              </h2>
              <p className="mt-5 max-w-[560px] text-lg font-medium leading-8 text-[#D9DEE7]">
                ระบบกลางสำหรับจัดการใบจอง ข้อมูลลูกค้า ปฏิทินงาน และการทำงานของทีม
              </p>

              <div className="mt-8 grid grid-cols-3 gap-3">
                {systemHighlights.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/12 bg-[#0D1621] px-4 py-3 text-sm font-bold text-[#DDE3EC]"
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-7 flex items-start gap-3 rounded-[22px] border border-[#C9A86A]/24 bg-[#C9A86A]/12 px-5 py-4 text-sm font-semibold leading-6 text-[#DDE3EC]">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#C9A86A]/18 text-[#E1C58D]">
                  <CheckIcon />
                </span>
                <p>
                  ระบบนี้สำหรับผู้ได้รับอนุญาตเท่านั้น และข้อมูลการเข้าสู่ระบบได้รับการปกป้องอย่างปลอดภัย
                </p>
              </div>
            </div>
          </aside>

          <form
            onSubmit={handleLogin}
            className="login-card mx-auto mt-5 w-full max-w-[500px] rounded-[26px] border border-white/80 bg-[#FBFAF7] px-5 py-6 shadow-[0_30px_90px_rgba(0,0,0,0.30),0_1px_0_rgba(255,255,255,0.88)_inset] sm:px-8 sm:py-8 lg:mt-0 lg:max-w-[486px] xl:px-9 xl:py-9"
          >
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] border border-[#E1D5C2] bg-[linear-gradient(145deg,#FFFFFF,#EFE8DB)] text-lg font-black text-[#1B2230] shadow-[0_16px_34px_rgba(27,34,48,0.12)]">
                SBM
              </div>
              <p className="mt-4 text-sm font-black text-[#A88953]">
                STUDIO BOOKING MANAGEMENT
              </p>
              <h2 className="mt-5 text-[28px] font-black leading-tight text-[#10231C]">
                เข้าสู่ระบบ
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-500">
                เข้าสู่ระบบเพื่อจัดการใบจอง ข้อมูลลูกค้า และปฏิทินงาน
              </p>
            </div>

            {isHelpOpen && (
              <div className="mt-5 rounded-2xl border border-[#DAD2C2] bg-[#F4F0E8] px-4 py-3 text-sm font-medium leading-6 text-[#4A4235]">
                กรุณาติดต่อผู้ดูแลระบบ หากต้องการรีเซ็ตรหัสผ่านหรือขอสิทธิ์เข้าใช้งาน
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
                  className="h-[54px] w-full rounded-2xl border border-[#DDD7CC] bg-white px-4 text-base font-semibold text-[#15171B] outline-none transition placeholder:text-zinc-400 focus:border-[#B99458] focus:shadow-[0_0_0_4px_rgba(185,148,88,0.16)]"
                  aria-describedby={error ? "login-error" : undefined}
                />

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
                        className="block w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-zinc-700 transition hover:bg-[#F5F1E9] focus:bg-[#F5F1E9] focus:outline-none"
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
                    className="h-[54px] w-full rounded-2xl border border-[#DDD7CC] bg-white px-4 pr-14 text-base font-semibold text-[#15171B] outline-none transition placeholder:text-zinc-400 focus:border-[#B99458] focus:shadow-[0_0_0_4px_rgba(185,148,88,0.16)]"
                    aria-describedby={error ? "login-error" : undefined}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none"
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
                className="flex h-[56px] w-full items-center justify-center rounded-2xl bg-[#151B26] px-5 text-base font-black text-white shadow-[0_14px_26px_rgba(21,27,38,0.22)] transition hover:-translate-y-0.5 hover:bg-[#0C111B] hover:shadow-[0_18px_34px_rgba(21,27,38,0.26)] active:translate-y-0 focus:outline-none focus:ring-4 focus:ring-[#B99458]/22 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
              >
                {isSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
            </div>

            {enabledProviders.length > 0 && (
              <div className="mt-7">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-zinc-200" />
                  <span className="text-xs font-bold text-zinc-400">
                    หรือเข้าสู่ระบบด้วย
                  </span>
                  <span className="h-px flex-1 bg-zinc-200" />
                </div>

                <div className="mt-4 grid gap-3">
                  {enabledProviders.map((provider) => (
                    <button
                      key={provider.key}
                      type="button"
                      onClick={() => handleProviderLogin(provider)}
                      className="relative flex h-[54px] w-full items-center justify-center rounded-2xl border border-[#DDD7CC] bg-white px-4 text-sm font-black text-[#15171B] transition hover:border-[#B99458] hover:bg-[#F8F4EC] focus:outline-none focus:ring-4 focus:ring-[#B99458]/16"
                    >
                      <span className="absolute left-4 flex h-8 min-w-8 items-center justify-center rounded-full border border-zinc-200 px-2 text-xs font-black text-[#1B2230]">
                        {provider.icon}
                      </span>
                      {provider.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-[#E7E0D4] pt-5 text-center text-xs font-semibold leading-5 text-zinc-500">
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

        .brand-panel {
          animation: loginSlideUp 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .login-card {
          animation: loginFadeIn 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        @keyframes loginGradient {
          from {
            background-position: 0% 50%, 0% 50%;
          }
          to {
            background-position: 100% 50%, 100% 50%;
          }
        }

        @keyframes loginSlideUp {
          from {
            transform: translateY(14px);
          }
          to {
            transform: translateY(0);
          }
        }

        @keyframes loginFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-gradient,
          .brand-panel,
          .login-card {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}

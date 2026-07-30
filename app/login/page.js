"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ADMIN_USERS_KEY = "central_admin_users";
const LOGIN_USERNAME_HISTORY_KEY = "login_username_history";
const MAX_LOGIN_USERNAME_HISTORY = 8;
const GENERAL_LOGIN_ERROR = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
const GOOGLE_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED === "true";
const GOOGLE_PROVIDER = {
  key: "google",
  label: "ดำเนินการต่อด้วยบัญชี Google",
  href: "/api/auth/google",
};

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

const systemHighlights = [
  { key: "booking", label: "จัดการใบจอง" },
  { key: "customers", label: "จัดการข้อมูลลูกค้า" },
  { key: "calendar", label: "จัดการปฏิทินงาน" },
  { key: "reports", label: "รายงานและรายได้" },
  { key: "documents", label: "ส่งอีเมลและเอกสาร" },
  { key: "cloud", label: "จัดเก็บไฟล์บนคลาวด์" },
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

function FeatureIcon({ type }) {
  const sharedProps = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    className: "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (type === "customers") {
    return (
      <svg {...sharedProps}>
        <path d="M16 11a4 4 0 1 0-8 0" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        <path d="M18.5 8.5a2.5 2.5 0 0 1 0 5" />
      </svg>
    );
  }

  if (type === "calendar") {
    return (
      <svg {...sharedProps}>
        <rect x="4" y="5" width="16" height="15" rx="3" />
        <path d="M8 3v4M16 3v4M4 10h16M8 14h3M13 14h3M8 17h2" />
      </svg>
    );
  }

  if (type === "reports") {
    return (
      <svg {...sharedProps}>
        <path d="M5 19V5" />
        <path d="M5 19h15" />
        <path d="M9 16v-5" />
        <path d="M13 16V8" />
        <path d="M17 16v-3" />
      </svg>
    );
  }

  if (type === "documents") {
    return (
      <svg {...sharedProps}>
        <path d="M5 7.5h14" />
        <path d="m5 7.5 7 5 7-5" />
        <rect x="4" y="6" width="16" height="12" rx="3" />
      </svg>
    );
  }

  if (type === "cloud") {
    return (
      <svg {...sharedProps}>
        <path d="M17.5 18H8a4 4 0 0 1-.8-7.92 5.5 5.5 0 0 1 10.42-1.85A4.5 4.5 0 0 1 17.5 18Z" />
        <path d="M12 12v4" />
        <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
      </svg>
    );
  }

  return (
    <svg {...sharedProps}>
      <path d="M7 4h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z" />
      <path d="M9 9h6" />
      <path d="M9 13h4" />
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
  const [enabledProviders, setEnabledProviders] = useState([]);
  const [pendingProvider, setPendingProvider] = useState("");
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

      setEnabledProviders(GOOGLE_LOGIN_ENABLED ? [GOOGLE_PROVIDER] : []);

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
    if (!provider.href || pendingProvider) return;
    setPendingProvider(provider.key);
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
        <section className="login-shell mx-auto flex min-h-[calc(100vh-44px)] w-full max-w-[1160px] flex-col lg:min-h-[660px] lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-8 xl:gap-12">
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

          <aside className="system-panel hidden text-white lg:block">
            <div className="rounded-[28px] border border-white/14 bg-[#141B25]/95 p-7 shadow-[0_34px_120px_rgba(0,0,0,0.32)] backdrop-blur-2xl xl:p-9">
              <div className="inline-flex items-center gap-3 rounded-full border border-[#C9A86A]/38 bg-[#C9A86A]/14 px-4 py-2 text-sm font-bold text-[#F0D69A]">
                <SystemIcon />
                ระบบกลางสำหรับทีมสตูดิโอ
              </div>

              <h2 className="mt-7 max-w-[560px] text-[44px] font-black leading-[1.04] text-[#F8F4EC] [text-shadow:0_10px_34px_rgba(0,0,0,0.38)] xl:text-[52px]">
                STUDIO BOOKING
                <span className="block">MANAGEMENT</span>
              </h2>
              <p className="mt-4 max-w-[560px] text-[17px] font-medium leading-8 text-[#D9DEE7]">
                ระบบกลางสำหรับจัดการใบจอง ข้อมูลลูกค้า ปฏิทินงาน และการทำงานของทีม
              </p>

              <div className="mt-7 grid grid-cols-2 gap-3">
                {systemHighlights.map((item) => (
                  <div
                    key={item.key}
                    className="flex min-h-[66px] items-center gap-3 rounded-2xl border border-white/12 bg-[#0D1621] px-4 py-3 text-sm font-bold text-[#DDE3EC]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#C9A86A]/22 bg-[#C9A86A]/10 text-[#E1C58D]">
                      <FeatureIcon type={item.key} />
                    </span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-start gap-3 rounded-[22px] border border-[#C9A86A]/24 bg-[#C9A86A]/12 px-5 py-4 text-sm font-semibold leading-6 text-[#DDE3EC]">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#C9A86A]/18 text-[#E1C58D]">
                  <CheckIcon />
                </span>
                <div>
                  <p className="text-xs font-black tracking-[0.18em] text-[#E1C58D]">
                    SECURE WORKSPACE
                  </p>
                  <p className="mt-1">
                    ระบบนี้สำหรับผู้ได้รับอนุญาตเท่านั้น การเข้าสู่ระบบและข้อมูลของผู้ใช้งานได้รับการปกป้องอย่างปลอดภัย
                  </p>
                </div>
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
                    หรือ
                  </span>
                  <span className="h-px flex-1 bg-zinc-200" />
                </div>

                <div className="mt-4 grid gap-3">
                  {enabledProviders.map((provider) => (
                    <button
                      key={provider.key}
                      type="button"
                      disabled={Boolean(pendingProvider)}
                      aria-busy={pendingProvider === provider.key}
                      onClick={() => handleProviderLogin(provider)}
                      className="relative flex h-[54px] w-full items-center justify-center rounded-2xl border border-[#DDD7CC] bg-white px-4 text-sm font-black text-[#15171B] transition hover:border-[#B99458] hover:bg-[#F8F4EC] active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-[#B99458]/16 disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:border-[#DDD7CC] disabled:hover:bg-white"
                    >
                      <span className="absolute left-4 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-[#1B2230]">
                        <ProviderIcon provider={provider.key} />
                      </span>
                      {pendingProvider === provider.key ? "กำลังเชื่อมต่อ..." : provider.label}
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

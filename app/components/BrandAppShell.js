"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getBrandTheme } from "@/app/lib/brandThemes";
import {
  CUSTOMER_REQUESTS_EVENT,
} from "@/app/lib/customerRequests";
import { safeGetObject } from "@/app/lib/safeStorage";
import {
  emptySidebarCounts,
  getBrandSidebarCounts,
  getRemoteBrandSidebarCounts,
  installSidebarCountsStorageBridge,
  isBrandStorageKey,
  SIDEBAR_COUNTS_EVENT,
} from "@/app/lib/sidebarCounts";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SIDEBAR_REMOTE_CACHE_TTL_MS = 30 * 1000;
const sidebarRemoteCountsCache = new Map();
const AUTH_SESSION_STORAGE_KEYS = [
  "loggedIn",
  "currentUser",
  "lastActivity",
  "activeBrand",
];
const INVALID_SESSION_STATUSES = new Set([401, 403]);

const isAdminRole = (role) => role === "ADMIN" || role === "super_admin";

const normalizeBrandList = (brands = []) =>
  Array.isArray(brands)
    ? brands.map((item) => (item === "pharadon" ? "pharadol" : item))
    : [];

const clearStoredClientSession = () => {
  AUTH_SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
};

const getStoredLastActivity = () => {
  const storedValue = Number(sessionStorage.getItem("lastActivity"));
  return Number.isFinite(storedValue) ? storedValue : Date.now();
};

const createSessionError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  error.isInvalidSession = INVALID_SESSION_STATUSES.has(status);
  return error;
};

const Icon = ({ name, className = "h-5 w-5" }) => {
  const paths = {
    menu: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </>
    ),
    customers: (
      <>
        <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    members: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
        <path d="M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M6 7v12h12V7" />
        <path d="M8 4h8l2 3H6l2-3Z" />
        <path d="M10 12h4" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 14h10l1-14" />
        <path d="M9 7V4h6v3" />
      </>
    ),
    today: (
      <>
        <path d="M7 3v4" />
        <path d="M17 3v4" />
        <path d="M4 8h16" />
        <path d="M5 5h14v16H5z" />
        <path d="M9 13h6" />
      </>
    ),
    upcoming: (
      <>
        <path d="M12 6v6l4 2" />
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v6h-6" />
      </>
    ),
    document: (
      <>
        <path d="M7 3h7l5 5v13H7z" />
        <path d="M14 3v6h5" />
        <path d="M10 13h6" />
        <path d="M10 17h6" />
      </>
    ),
    calendar: (
      <>
        <path d="M7 3v4" />
        <path d="M17 3v4" />
        <path d="M4 8h16" />
        <path d="M5 5h14v16H5z" />
        <path d="M8 12h3v3H8z" />
      </>
    ),
    income: (
      <>
        <path d="M12 2v20" />
        <path d="M17 6.5c-1.1-1-2.7-1.5-4.6-1.5-2.7 0-4.4 1.2-4.4 3.1 0 4.1 9 1.9 9 6.7 0 2-1.7 3.2-4.7 3.2-2.1 0-4-.7-5.3-2" />
      </>
    ),
    reports: (
      <>
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
        <path d="M3 19h18" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    settings: (
      <>
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05a2.1 2.1 0 0 1-3 3l-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.66V21a2.1 2.1 0 0 1-4.2 0v-.08A1.8 1.8 0 0 0 8.4 19.3a1.8 1.8 0 0 0-2 .36l-.05.05a2.1 2.1 0 1 1-3-3l.05-.05a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.1 13H2a2.1 2.1 0 0 1 0-4.2h.08A1.8 1.8 0 0 0 3.7 7.7a1.8 1.8 0 0 0-.36-2l-.05-.05a2.1 2.1 0 1 1 3-3l.05.05a1.8 1.8 0 0 0 2 .36H8.4A1.8 1.8 0 0 0 9.5 1.4V1a2.1 2.1 0 0 1 4.2 0v.08a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 2-.36l.05-.05a2.1 2.1 0 1 1 3 3l-.05.05a1.8 1.8 0 0 0-.36 2v.1A1.8 1.8 0 0 0 21.1 8.8H21a2.1 2.1 0 0 1 0 4.2h-.08A1.8 1.8 0 0 0 19.4 15Z" />
      </>
    ),
    mail: (
      <>
        <path d="M4 6h16v12H4z" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17 15 12l-5-5" />
        <path d="M15 12H3" />
        <path d="M21 3v18" />
      </>
    ),
  };

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
};

const buildMenuItems = (brandId, counts) => {
  const bookingHref = `/${brandId}`;

  return [
    {
      href: `/${brandId}/dashboard`,
      icon: "today",
      title: "Dashboard",
      subtitle: "ภาพรวมระบบ",
      exact: true,
    },
    {
      href: bookingHref,
      icon: "document",
      title: "ระบบสร้างใบจอง",
      subtitle: "สร้างใบจองใหม่",
      exact: true,
      aliases: [`/${brandId}/booking`, `/${brandId}/booking-view`],
      badgeCount: counts.draftBookings,
    },
    {
      href: `/${brandId}/customer-requests`,
      icon: "bell",
      title: "คำขอจากลูกค้า",
      subtitle: "ข้อมูลจากฟอร์ม",
      badgeCount: counts.customerRequests,
    },
    {
      href: `/${brandId}/customers`,
      icon: "customers",
      title: "ข้อมูลลูกค้า",
      subtitle: "รายชื่อลูกค้า",
      badgeCount: counts.activeCustomers,
    },
    {
      href: `/${brandId}/members`,
      icon: "members",
      title: "สมาชิก",
      subtitle: "ทีมงานและบุคลากร",
      badgeCount: counts.membersCount,
      badgeColor: counts.membersCount > 0 ? "accent" : "",
    },
    {
      href: `/${brandId}/archives`,
      icon: "archive",
      title: "คลังข้อมูล",
      subtitle: "งานที่จัดเก็บ",
      badgeCount: counts.archivedJobs,
    },
    {
      href: `/${brandId}/calendar`,
      icon: "calendar",
      title: "ปฏิทินงาน",
      subtitle: "ตารางงานทั้งหมด",
      badgeCount: counts.calendarJobs,
    },
    {
      href: `/${brandId}/income`,
      icon: "income",
      title: "รายได้",
      subtitle: "ยอดชำระ",
      badgeCount: counts.pendingPayments,
    },
    {
      href: `/${brandId}/reports`,
      icon: "reports",
      title: "รายงาน",
      subtitle: "สถิติธุรกิจ",
    },
    {
      href: `/${brandId}/notifications`,
      icon: "bell",
      title: "แจ้งเตือน",
      subtitle: "งานใกล้ถึงวัน",
      badgeCount: counts.notificationsCount,
    },
    {
      href: `/${brandId}/mail`,
      icon: "mail",
      title: "ระบบส่งอีเมล",
      subtitle: "ประวัติอีเมล",
      badgeCount: counts.emailAttention,
    },
    {
      href: `/google-upload?brand=${brandId}`,
      icon: "mail",
      title: "ส่งงานลูกค้า",
      subtitle: "อัปโหลดและแชร์งาน",
      badgeCount: 0,
    },
    {
      href: `/${brandId}/trash`,
      icon: "trash",
      title: "ถังขยะ",
      subtitle: "รายการที่ถูกลบ",
      badgeCount: counts.trashItems,
    },
    {
      href: `/${brandId}/settings`,
      icon: "settings",
      title: "ตั้งค่าระบบ",
      subtitle: "ข้อมูลระบบ",
    },
  ];
};

const isActiveMenu = (pathname, item) => {
  const paths = [item.href, ...(item.aliases || [])];
  return paths.some((href) =>
    item.exact ? pathname === href.split("?")[0] : pathname === href.split("?")[0] || pathname.startsWith(`${href}/`)
  );
};

const colorWithAlpha = (color, alphaHex, fallback) =>
  typeof color === "string" && color.startsWith("#") ? `${color}${alphaHex}` : fallback;

const Badge = ({ count, theme, color }) => {
  const numericCount = Number(count || 0);
  if (numericCount <= 0) return null;
  const backgroundColor = color === "accent" ? theme.accent : theme.danger;

  return (
    <span
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black leading-none text-white"
      style={{ backgroundColor }}
    >
      {numericCount > 99 ? "99+" : numericCount}
    </span>
  );
};

const BrandSidebar = ({ brandId, onNavigate }) => {
  const pathname = usePathname();
  const theme = getBrandTheme(brandId);
  const sidebarText = theme.sidebarText || "#FFFFFF";
  const sidebarMuted = theme.sidebarMuted || "rgba(255, 255, 255, 0.5)";
  const sidebarSignedInBg = theme.sidebarSignedInBg || "rgba(255, 255, 255, 0.1)";
  const sidebarSignedInBorder =
    theme.sidebarSignedInBorder || "rgba(255, 255, 255, 0.1)";
  const [currentUser, setCurrentUser] = useState(null);
  const [counts, setCounts] = useState(emptySidebarCounts);

  useEffect(() => {
    installSidebarCountsStorageBridge();

    let refreshFrame = 0;
    let disposed = false;
    let refreshRequestId = 0;

    const loadShellState = async () => {
      const requestId = ++refreshRequestId;
      const savedUser = safeGetObject("currentUser", {
        storage: "session",
        maxBytes: 64 * 1024,
      });
      const fallbackCounts = getBrandSidebarCounts(brandId);

      if (!disposed) {
        setCurrentUser(savedUser);
        setCounts(fallbackCounts);
      }

      try {
        const cachedCounts = sidebarRemoteCountsCache.get(brandId);
        const cacheIsFresh =
          cachedCounts && Date.now() - cachedCounts.cachedAt < SIDEBAR_REMOTE_CACHE_TTL_MS;
        const remoteCounts = cacheIsFresh
          ? cachedCounts.counts
          : await getRemoteBrandSidebarCounts(brandId);
        if (!cacheIsFresh) {
          sidebarRemoteCountsCache.set(brandId, {
            counts: remoteCounts,
            cachedAt: Date.now(),
          });
        }
        if (!disposed && requestId === refreshRequestId) {
          setCounts(remoteCounts);
        }
      } catch (error) {
        console.error("Cannot load sidebar counts from Supabase", error);
        if (!disposed && requestId === refreshRequestId) {
          setCounts(fallbackCounts);
        }
      }
    };

    const queueRefresh = () => {
      if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
      refreshFrame = window.requestAnimationFrame(() => {
        refreshFrame = 0;
        loadShellState();
      });
    };

    const handleStorage = (event) => {
      if (isBrandStorageKey(event.key, brandId)) queueRefresh();
    };
    const handleSidebarCountsEvent = (event) => {
      if (event?.detail?.brandId && event.detail.brandId !== brandId) return;
      queueRefresh();
    };
    const handleCustomerRequestsEvent = () => queueRefresh();

    loadShellState();
    window.addEventListener(SIDEBAR_COUNTS_EVENT, handleSidebarCountsEvent);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", queueRefresh);
    window.addEventListener(CUSTOMER_REQUESTS_EVENT, handleCustomerRequestsEvent);

    return () => {
      disposed = true;
      if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener(SIDEBAR_COUNTS_EVENT, handleSidebarCountsEvent);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", queueRefresh);
      window.removeEventListener(
        CUSTOMER_REQUESTS_EVENT,
        handleCustomerRequestsEvent
      );
    };
  }, [brandId]);

  const menuItems = useMemo(() => buildMenuItems(brandId, counts), [brandId, counts]);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } catch {
      // Continue with client-side logout even if the network request fails.
    }
    clearStoredClientSession();
    window.location.replace("/login");
  };

  const handleMenuNavigate = (event, item) => {
    if (item.title === "ระบบสร้างใบจอง") {
      event?.preventDefault();
      localStorage.removeItem(`${brandId}_selectedBooking`);
      localStorage.removeItem(`${brandId}_currentBooking`);
      localStorage.removeItem(`${brandId}_bookingDraft`);
      localStorage.removeItem(`pendingBookingPrefill_${brandId}`);
      onNavigate?.();
      window.location.assign(item.href);
      return;
    }

    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col">
      <Link
        href={`/${brandId}/dashboard`}
        prefetch={false}
        onClick={onNavigate}
        className="flex items-center gap-3 px-1"
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm">
          <Image
            src={theme.logo}
            alt={theme.name}
            fill
            sizes="48px"
            className="object-contain p-1.5"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-black text-white">
            {theme.shortName}
          </p>
          <p
            className="mt-0.5 truncate text-[10px] font-semibold uppercase"
            style={{ color: sidebarMuted }}
          >
            {theme.tagline}
          </p>
        </div>
      </Link>

      <nav className="mt-6 space-y-1">
        {menuItems.map((item) => {
          const active = isActiveMenu(pathname, item);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={(event) => handleMenuNavigate(event, item)}
              className="relative flex min-h-[54px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[14px] font-bold transition hover:bg-white/10"
              style={{
                backgroundColor: active ? theme.sidebarActiveBg : "transparent",
                color: active
                  ? sidebarText
                  : colorWithAlpha(
                      sidebarText,
                      "B3",
                      "rgba(255, 255, 255, 0.68)"
                    ),
              }}
            >
              {active && (
                <span
                  className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full"
                  style={{ backgroundColor: theme.accent }}
                />
              )}
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: active
                    ? theme.sidebarIconActiveBg || theme.accent
                    : "rgba(255, 255, 255, 0.08)",
                  color: active
                    ? theme.sidebarIconActiveColor || theme.primaryDark
                    : colorWithAlpha(
                        sidebarText,
                        "D9",
                        "rgba(255, 255, 255, 0.82)"
                      ),
                }}
              >
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.title}</span>
                <span
                  className="mt-0.5 block truncate text-[11px] font-semibold"
                  style={{
                    color: active
                      ? sidebarMuted
                      : colorWithAlpha(
                          sidebarMuted,
                          "A6",
                          "rgba(255, 255, 255, 0.34)"
                        ),
                  }}
                >
                  {item.subtitle}
                </span>
              </span>
              <Badge count={item.badgeCount} theme={theme} color={item.badgeColor} />
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-5">
        <div
          className="rounded-xl border p-3"
          style={{
            backgroundColor: sidebarSignedInBg,
            borderColor: sidebarSignedInBorder,
          }}
        >
          <p
            className="text-[10px] font-semibold uppercase"
            style={{
              color: colorWithAlpha(
                sidebarMuted,
                "B3",
                "rgba(255, 255, 255, 0.42)"
              ),
            }}
          >
            Signed in
          </p>
          <p className="mt-1 truncate text-[13px] font-bold" style={{ color: sidebarText }}>
            {currentUser?.name || currentUser?.username || "Admin"}
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/10 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-white/15"
        >
          <Icon name="logout" className="h-[18px] w-[18px]" />
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
};

export default function BrandAppShell({ brandId, children }) {
  const theme = getBrandTheme(brandId);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState("checking");
  const [authError, setAuthError] = useState("");
  const [authRetryKey, setAuthRetryKey] = useState(0);
  const authStatusRef = useRef("checking");
  const verifyRequestRef = useRef(0);

  const setVerifiedStatus = useCallback((nextStatus) => {
    authStatusRef.current = nextStatus;
    setAuthStatus(nextStatus);
  }, []);

  useEffect(() => {
    installSidebarCountsStorageBridge();
    const requestId = verifyRequestRef.current + 1;
    verifyRequestRef.current = requestId;
    const abortController = new AbortController();

    const isCurrentRequest = () =>
      verifyRequestRef.current === requestId && !abortController.signal.aborted;

    const denyAccess = () => {
      if (!isCurrentRequest()) return;
      setVerifiedStatus("denied");
      setAuthError("");
      clearStoredClientSession();
      window.location.replace(`/login?next=${encodeURIComponent(pathname)}`);
    };

    const denyRouteAccess = (redirectTo) => {
      if (!isCurrentRequest()) return;
      setVerifiedStatus("denied");
      setAuthError("");
      window.location.replace(redirectTo || `/${brandId}/dashboard`);
    };

    const checkAccess = (currentUser, activeBrand) => {
      const loggedIn = sessionStorage.getItem("loggedIn") === "true";
      const lastActivity = getStoredLastActivity();
      const sessionExpired = Date.now() - lastActivity > SESSION_TIMEOUT_MS;
      const normalizedBrands = normalizeBrandList(currentUser?.brands);
      const accountIsActive = currentUser?.active !== false;
      const accountIsAdmin = isAdminRole(currentUser?.role);
      const hasBrandAccess = normalizedBrands.includes(brandId);
      const brandIsCorrect =
        activeBrand === brandId && (accountIsAdmin || hasBrandAccess);

      if (
        !loggedIn ||
        !currentUser ||
        !accountIsActive ||
        sessionExpired
      ) {
        return { allowed: false, reason: "invalid-session" };
      }

      if (!brandIsCorrect) {
        return { allowed: false, reason: "route-denied" };
      }

      sessionStorage.setItem("lastActivity", String(Date.now()));
      return { allowed: true };
    };

    const allowAccess = () => {
      if (!isCurrentRequest()) return;
      setAuthError("");
      setVerifiedStatus("allowed");
    };

    const restoreServerSession = async () => {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        signal: abortController.signal,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success || !result.user) {
        throw createSessionError(
          "No active server session",
          response.ok ? 401 : response.status
        );
      }

      const accountIsAdmin = isAdminRole(result.user.role);
      const nextActiveBrand = accountIsAdmin ? brandId : result.activeBrand;

      if (!isCurrentRequest()) return null;

      if (Array.isArray(result.users)) {
        localStorage.setItem("central_admin_users", JSON.stringify(result.users));
      }

      clearStoredClientSession();
      sessionStorage.setItem("loggedIn", "true");
      sessionStorage.setItem("currentUser", JSON.stringify(result.user));
      sessionStorage.setItem("lastActivity", String(Date.now()));
      sessionStorage.setItem("activeBrand", nextActiveBrand);
      return {
        currentUser: result.user,
        activeBrand: nextActiveBrand,
        redirectTo: result.redirectTo,
      };
    };

    const verifyAccess = async () => {
      try {
        const currentUser = safeGetObject("currentUser", {
          storage: "session",
          maxBytes: 64 * 1024,
        });
        const activeBrand = sessionStorage.getItem("activeBrand");
        const localAccess = checkAccess(currentUser, activeBrand);

        if (localAccess.allowed) {
          allowAccess();
          const restoredSession = await restoreServerSession();
          if (!restoredSession || !isCurrentRequest()) return;

          const restoredAccess = checkAccess(
            restoredSession.currentUser,
            restoredSession.activeBrand
          );

          if (restoredAccess.allowed) {
            allowAccess();
          } else if (restoredAccess.reason === "route-denied") {
            denyRouteAccess(restoredSession.redirectTo);
          } else {
            denyAccess();
          }
          return;
        }

        if (authStatusRef.current !== "allowed") {
          setVerifiedStatus("checking");
        }

        const restoredSession = await restoreServerSession();
        if (!isCurrentRequest()) return;

        const restoredAccess = checkAccess(
          restoredSession.currentUser,
          restoredSession.activeBrand
        );

        if (restoredAccess.allowed) {
          allowAccess();
        } else if (restoredAccess.reason === "route-denied") {
          denyRouteAccess(restoredSession.redirectTo);
        } else {
          denyAccess();
        }
      } catch (error) {
        if (!isCurrentRequest() || error?.name === "AbortError") return;

        if (error?.isInvalidSession) {
          denyAccess();
          return;
        }

        setAuthError(
          "ไม่สามารถตรวจสอบ session จากเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง"
        );
        if (authStatusRef.current !== "allowed") {
          setVerifiedStatus("error");
        }
      }
    };

    verifyAccess();

    return () => {
      abortController.abort();
    };
  }, [brandId, pathname, authRetryKey, setVerifiedStatus]);

  if (authStatus !== "allowed") {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-4 text-center text-sm font-semibold"
        style={{ backgroundColor: theme.background, color: theme.muted }}
      >
        <div className="space-y-4">
          <p>
            {authStatus === "error"
              ? authError
              : "กำลังตรวจสอบสิทธิ์การใช้งาน..."}
          </p>
          {authStatus === "error" && (
            <button
              type="button"
              onClick={() => {
                setAuthError("");
                setVerifiedStatus("checking");
                setAuthRetryKey((current) => current + 1);
              }}
              className="rounded-xl border px-4 py-2 text-sm font-bold transition hover:bg-white/40"
              style={{ borderColor: theme.border, color: theme.text }}
            >
              ลองตรวจสอบอีกครั้ง
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <div
      className="brand-app-shell min-h-screen overflow-x-hidden"
      data-brand-shell={brandId}
      style={{
        backgroundColor: theme.background,
        color: theme.text,
        "--brand-primary": theme.primary,
        "--brand-primary-dark": theme.primaryDark,
        "--brand-accent": theme.accent,
        "--brand-accent-soft": theme.accentSoft,
        "--brand-background": theme.background,
        "--brand-card": theme.card,
        "--brand-border": theme.border,
        "--brand-text": theme.text,
        "--brand-muted": theme.muted,
        "--brand-danger": theme.actionDangerBg || theme.danger,
        "--brand-danger-hover": theme.actionDangerHover || "#B91C1C",
        "--brand-table-header": theme.tableHeaderBg,
        "--brand-table-text": theme.tableHeaderText,
        "--brand-shadow": theme.shadow,
        "--brand-action-view": theme.actionViewBg || theme.buttonPrimary,
        "--brand-action-view-hover": theme.actionViewHover || theme.primaryDark,
        "--brand-action-secondary": theme.actionArchiveBg || theme.accent,
        "--brand-action-secondary-hover": theme.actionArchiveHover || theme.accent,
        "--brand-action-secondary-text": theme.actionArchiveText || "#0B0B0D",
      }}
    >
      <aside
        className="fixed left-0 top-0 z-50 hidden h-screen w-[270px] overflow-y-auto overflow-x-hidden px-4 py-5 lg:block"
        style={{ backgroundColor: theme.sidebarBg }}
      >
        <BrandSidebar brandId={brandId} />
      </aside>

      <div className="min-w-0 lg:ml-[270px]">
        <header
          className="sticky top-0 z-40 border-b px-4 py-3 backdrop-blur-xl lg:hidden"
          style={{
            backgroundColor: `${theme.background}F2`,
            borderColor: theme.border,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border bg-white"
              style={{ borderColor: theme.border, color: theme.primary }}
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>

            <Link
              href={`/${brandId}/dashboard`}
              prefetch={false}
              className="flex min-w-0 items-center gap-3"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white">
                <Image
                  src={theme.logo}
                  alt={theme.name}
                  fill
                  sizes="40px"
                  className="object-contain p-1"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{theme.shortName}</p>
                <p className="truncate text-[11px] font-semibold" style={{ color: theme.muted }}>
                  App Menu
                </p>
              </div>
            </Link>

            <div className="h-11 w-11" />
          </div>
        </header>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <aside
              className="relative h-full w-[min(86vw,340px)] overflow-y-auto px-4 py-5 shadow-2xl"
              style={{ backgroundColor: theme.sidebarBg }}
            >
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
                >
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </div>
              <BrandSidebar brandId={brandId} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <main className="brand-main-content min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

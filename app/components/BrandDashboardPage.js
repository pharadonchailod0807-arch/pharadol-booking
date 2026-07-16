"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  calculateDashboardCounts,
  emptyDashboardCounts,
} from "@/app/lib/dashboardCounts";
import { getBrandTheme } from "@/app/lib/brandThemes";
import {
  CUSTOMER_REQUESTS_EVENT,
  countNewCustomerRequests,
  loadCustomerRequests,
  readLocalCustomerRequests,
} from "@/app/lib/customerRequests";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const readArray = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const formatThaiDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
        <path d="M9 17h3" />
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
    refresh: (
      <>
        <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
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

const DashboardBadge = ({ count, ready, theme }) => {
  if (!ready || Number(count || 0) <= 0) return null;

  const numericCount = Number(count || 0);

  return (
    <span
      className="absolute right-4 top-4 z-20 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-black leading-none text-white shadow-lg"
      style={{ backgroundColor: theme.danger }}
    >
      {numericCount > 99 ? "99+" : numericCount}
    </span>
  );
};

const BrandButton = ({ children, onClick, disabled, variant = "primary", theme }) => {
  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: isPrimary ? theme.buttonPrimary : theme.buttonSecondary,
        borderColor: isPrimary ? theme.buttonPrimary : theme.border,
        color: isPrimary ? "#FFFFFF" : theme.text,
        boxShadow: isPrimary ? `0 14px 30px ${theme.shadow}` : "none",
      }}
    >
      {children}
    </button>
  );
};

const SidebarContent = ({
  actionCards,
  currentUser,
  countsReady,
  dashboardPath,
  isMobile = false,
  onNavigate,
  onLogout,
  theme,
}) => (
  <div className="flex h-full flex-col">
    <div className="flex items-center gap-3 px-1">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm">
        <Image src={theme.logo} alt={theme.name} fill sizes="56px" className="object-contain p-1.5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-black text-white">{theme.shortName}</p>
        <p className="mt-0.5 truncate text-[11px] font-semibold uppercase text-white/55">
          {theme.tagline}
        </p>
      </div>
    </div>

    <div className="mt-7 space-y-1.5">
      {actionCards.map(([href, icon, title, , badgeCount]) => {
        const isActive = href === dashboardPath;
        return (
          <button
            key={href}
            type="button"
            onClick={() => onNavigate(href)}
            className="relative flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 pr-10 text-left text-sm font-bold transition"
            style={{
              backgroundColor: isActive ? theme.sidebarActiveBg : "transparent",
              color: isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.68)",
            }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{
                backgroundColor: isActive ? theme.accent : "rgba(255, 255, 255, 0.08)",
                color: isActive ? theme.primaryDark : "rgba(255, 255, 255, 0.82)",
              }}
            >
              <Icon name={icon} className="h-5 w-5" />
            </span>
            <span className="truncate">{title}</span>
            <DashboardBadge count={badgeCount} ready={countsReady} theme={theme} />
          </button>
        );
      })}
    </div>

    <div className="mt-auto pt-6">
      <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
        <p className="text-xs font-semibold uppercase text-white/45">Signed in</p>
        <p className="mt-1 truncate text-sm font-bold text-white">
          {currentUser?.name || currentUser?.username || "Admin"}
        </p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15"
      >
        <Icon name="logout" className="h-5 w-5" />
        ออกจากระบบ
      </button>
    </div>

    {isMobile && <div className="h-4" />}
  </div>
);

export default function BrandDashboardPage({ brandId }) {
  const theme = getBrandTheme(brandId);
  const bookingDraftKey = `${brandId}_bookingDraft`;
  const customerRequestsKey = `${brandId}_customer_requests`;
  const dashboardPath = `/${brandId}/dashboard`;
  const welcomeSeenKey = `${brandId}WelcomeSeen`;
  const bookingPath = brandId === "adisorn" ? "/adisorn/booking" : "/pharadol";

  const [currentUser, setCurrentUser] = useState(null);
  const [dashboardCounts, setDashboardCounts] = useState(emptyDashboardCounts);
  const [countsReady, setCountsReady] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showWelcome, setShowWelcome] = useState(null);
  const [newCustomerRequestCount, setNewCustomerRequestCount] = useState(0);
  const [isRefreshingCounts, setIsRefreshingCounts] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const loadDashboardSnapshot = useCallback((savedUser) => {
    setCountsReady(false);

    const parsedUser = {
      ...savedUser,
      brandId,
      brandName: theme.name,
    };

    setCurrentUser(parsedUser);

    const nextCounts = calculateDashboardCounts({
      brandId,
      customers: readArray(`${brandId}_customers`),
      archiveItems: readArray(`${brandId}_archives`),
      trashItems: readArray(`${brandId}_trash`),
      emailHistory: readArray(`${brandId}_email_history`),
      hasBookingDraft: Boolean(localStorage.getItem(bookingDraftKey)),
    });

    setDashboardCounts(nextCounts);
    setNewCustomerRequestCount(
      countNewCustomerRequests(readLocalCustomerRequests(brandId))
    );
    setCountsReady(true);
  }, [bookingDraftKey, brandId, theme.name]);

  const refreshDashboardCounts = async () => {
    if (!currentUser || isRefreshingCounts) return;

    setIsRefreshingCounts(true);
    loadDashboardSnapshot(currentUser);

    try {
      const result = await loadCustomerRequests(brandId, { forceRemote: true });
      setNewCustomerRequestCount(countNewCustomerRequests(result.requests));
    } finally {
      setIsRefreshingCounts(false);
    }
  };

  useEffect(() => {
    const loadDashboardData = (savedUser, { syncRemote = false } = {}) => {
      loadDashboardSnapshot(savedUser);

      if (syncRemote) {
        loadCustomerRequests(brandId).then(({ requests }) => {
          setNewCustomerRequestCount(countNewCustomerRequests(requests));
        });
      }
    };

    const verifyAccess = ({ refreshData = false } = {}) => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const savedUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const normalizedBrands = Array.isArray(savedUser?.brands)
          ? savedUser.brands.map((brand) =>
              brand === "pharadon" ? "pharadol" : brand
            )
          : [];
        const systemUsers = JSON.parse(
          localStorage.getItem("central_admin_users") || "[]"
        );
        const latestAccount = Array.isArray(systemUsers)
          ? systemUsers.find((user) => user.id === savedUser?.id)
          : null;
        const isAdmin = savedUser?.role === "ADMIN";
        const hasBrandAccess = normalizedBrands.includes(brandId);
        const accountIsActive =
          brandId === "adisorn"
            ? latestAccount?.active === true
            : savedUser?.active !== false;
        const brandIsCorrect =
          activeBrand === brandId && (isAdmin || hasBrandAccess);
        const lastActivity = Number(
          sessionStorage.getItem("lastActivity") || Date.now()
        );
        const sessionExpired = Date.now() - lastActivity > SESSION_TIMEOUT_MS;

        if (
          !loggedIn ||
          !savedUser ||
          !accountIsActive ||
          !brandIsCorrect ||
          sessionExpired
        ) {
          sessionStorage.clear();
          window.location.replace("/login");
          return false;
        }

        sessionStorage.setItem("lastActivity", String(Date.now()));
        if (refreshData) loadDashboardData(savedUser, { syncRemote: true });
        setIsAuthorized(true);
        return true;
      } catch (error) {
        console.error("Dashboard authorization error:", error);
        sessionStorage.clear();
        window.location.replace("/login");
        return false;
      }
    };

    if (!verifyAccess({ refreshData: true })) return undefined;

    let activityTimer;
    const updateActivity = () => {
      window.clearTimeout(activityTimer);
      activityTimer = window.setTimeout(() => {
        sessionStorage.setItem("lastActivity", String(Date.now()));
      }, 500);
    };

    const handleStorage = (event) => {
      const watchedKeys = [
        "central_admin_users",
        `${brandId}_customers`,
        `${brandId}_archives`,
        `${brandId}_trash`,
        `${brandId}_email_history`,
        bookingDraftKey,
        customerRequestsKey,
      ];

      if (watchedKeys.includes(event.key)) {
        verifyAccess({ refreshData: true });
      }
    };
    const handleCustomerRequestsEvent = () => verifyAccess({ refreshData: true });
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );
    window.addEventListener("storage", handleStorage);
    window.addEventListener(CUSTOMER_REQUESTS_EVENT, handleCustomerRequestsEvent);

    return () => {
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        CUSTOMER_REQUESTS_EVENT,
        handleCustomerRequestsEvent
      );
    };
  }, [brandId, bookingDraftKey, customerRequestsKey, loadDashboardSnapshot]);

  useEffect(() => {
    if (!isAuthorized) return;

    const hasSeenWelcome = sessionStorage.getItem(welcomeSeenKey) === "true";
    const timer = window.setTimeout(() => {
      setShowWelcome(!hasSeenWelcome);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isAuthorized, welcomeSeenKey]);

  const logout = () => {
    sessionStorage.clear();
    window.location.replace("/login");
  };

  const startSystem = () => {
    sessionStorage.setItem(welcomeSeenKey, "true");
    sessionStorage.setItem("lastActivity", String(Date.now()));
    setShowWelcome(false);
  };

  const navigate = (href) => {
    setIsMobileMenuOpen(false);
    window.location.href = href;
  };

  const customerCount = dashboardCounts.activeCustomers;
  const archiveCount = dashboardCounts.archivedJobs;
  const trashCount = dashboardCounts.trashItems;
  const todayJobs = dashboardCounts.todayJobs;
  const upcomingJobs = dashboardCounts.upcoming7Days;
  const monthJobs = dashboardCounts.monthJobs;
  const draftBookingCount = dashboardCounts.draftBookings;
  const pendingPaymentCount = dashboardCounts.pendingPayments;
  const emailAttentionCount = dashboardCounts.emailAttention;
  const alerts = dashboardCounts.alerts;
  const brandCustomers = useMemo(
    () => readArray(`${brandId}_customers`),
    [brandId, customerCount, monthJobs, todayJobs]
  );

  const statCards = [
    ["ลูกค้าปัจจุบัน", customerCount, "รายการ", "customers"],
    ["งานวันนี้", todayJobs, "งาน", "today"],
    ["งานใน 7 วัน", upcomingJobs, "งาน", "upcoming"],
    ["งานเดือนนี้", monthJobs, "งาน", "calendar"],
  ];

  const actionCards = [
    [dashboardPath, "today", "Dashboard", "ภาพรวมระบบ", 0],
    [bookingPath, "document", "ระบบสร้างใบจอง", "สร้างใบจองใหม่", draftBookingCount],
    [`/${brandId}/customer-requests`, "bell", "คำขอจากลูกค้า", "ข้อมูลที่ลูกค้ากรอกผ่านลิงก์", newCustomerRequestCount],
    [`/${brandId}/customers`, "customers", "ข้อมูลลูกค้า", "รายชื่อลูกค้าทั้งหมด", customerCount],
    [`/${brandId}/archives`, "archive", "คลังข้อมูล", "ข้อมูลที่จัดเก็บแล้ว", archiveCount],
    [`/${brandId}/calendar`, "calendar", "ปฏิทินงาน", "ตารางงานทั้งหมด", monthJobs],
    [`/${brandId}/trash`, "trash", "ถังขยะ", "รายการที่ถูกลบ", trashCount],
    [`/${brandId}/income`, "income", "รายได้", "รายได้ทั้งหมด", pendingPaymentCount],
    [`/${brandId}/reports`, "reports", "รายงาน", "สถิติและรายงานธุรกิจ", 0],
    [`/${brandId}/notifications`, "bell", "แจ้งเตือน", "งานใกล้ถึงกำหนด", upcomingJobs],
    [`/${brandId}/settings`, "settings", "ตั้งค่าระบบ", "จัดการข้อมูลระบบ", 0],
    [`/${brandId}/mail`, "mail", "ระบบส่งอีเมล", "ประวัติและสถานะอีเมล", emailAttentionCount],
  ];

  const mainMenuCards = actionCards.filter(([href]) => href !== dashboardPath);

  const latestJobs = useMemo(
    () =>
      brandCustomers
        .filter((customer) => customer?.eventDate)
        .sort((a, b) => {
          const dateA = new Date(a.eventDate).getTime() || 0;
          const dateB = new Date(b.eventDate).getTime() || 0;
          if (dateA !== dateB) return dateB - dateA;
          return String(b.bookingNumber || "").localeCompare(
            String(a.bookingNumber || ""),
            "th"
          );
        })
        .slice(0, 4)
        .map((customer) => ({
          title: customer.customerName || "ไม่ระบุชื่อลูกค้า",
          detail: `${formatThaiDate(customer.eventDate)} · ${customer.service || "งาน"}`,
          icon: "calendar",
        })),
    [brandCustomers]
  );

  const latestActivity = useMemo(() => {
    const items = [
      ...latestJobs,
      ...alerts.slice(0, 3).map((job) => ({
        title: job.customerName || "งานใกล้ถึงวัน",
        detail: `${job.service || "งาน"} อีก ${job.diffDays} วัน`,
        icon: "upcoming",
      })),
    ];

    if (newCustomerRequestCount > 0) {
      items.unshift({
        title: "คำขอจากลูกค้าใหม่",
        detail: `${newCustomerRequestCount} รายการรอเปิดดู`,
        icon: "bell",
      });
    }

    if (pendingPaymentCount > 0) {
      items.push({
        title: "ยอดค้างชำระ",
        detail: `${pendingPaymentCount} รายการต้องติดตาม`,
        icon: "income",
      });
    }

    return items.slice(0, 5);
  }, [alerts, latestJobs, newCustomerRequestCount, pendingPaymentCount]);

  const quickActions = [
    [bookingPath, "document", "สร้างใบจอง"],
    [`/${brandId}/calendar`, "calendar", "เปิดปฏิทิน"],
    [`/${brandId}/customer-requests`, "bell", "ดูคำขอลูกค้า"],
  ];

  if (!isAuthorized || !currentUser || showWelcome === null) {
    return (
      <main
        className="flex min-h-screen items-center justify-center text-sm font-semibold"
        style={{ backgroundColor: theme.background, color: theme.muted }}
      >
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  if (showWelcome) {
    const isPharadol = brandId === "pharadol";
    const welcomeConfig = isPharadol
      ? {
          backgroundImage: "/pharadol-wedding-bg.jpg",
          backgroundOpacity: "opacity-35",
          radial: "radial-gradient(circle_at_center,rgba(22,78,51,0.18),transparent_48%)",
          orbOne: "bg-emerald-700/8",
          orbTwo: "bg-slate-500/8",
          logoBorder: "border-[#b89a68]/25",
          logoBg: "#10291d",
          logoShadow: "rgba(16,41,29,0.5)",
          logoPulseBase: "rgba(16, 41, 29, 0.38)",
          logoPulseGlow: "rgba(184, 154, 104, 0.28)",
          logoClassName:
            "scale-[1.38] object-cover transition duration-700 hover:scale-[1.45]",
          logoSrc: "/pharadol-logo.jpeg",
          eyebrow: "PHARADOL PRODUCTION Booking Management",
          subEyebrow: "FILM & STILL",
          title: "PHARADOL PRODUCTION",
          titleGradient: "from-white via-[#e8ded0] to-white",
          description:
            "ระบบจัดการงาน ลูกค้า ใบจอง ปฏิทิน รายได้ และข้อมูลทั้งหมดของ PHARADOL PRODUCTION",
        }
      : {
          backgroundImage: "/adisorn-wedding-bg.jpg",
          backgroundOpacity: "opacity-30",
          radial: "radial-gradient(circle_at_center,rgba(112,58,20,0.2),transparent_45%)",
          orbOne: "bg-fuchsia-500/12",
          orbTwo: "bg-blue-500/12",
          logoBorder: "border-[#c88a55]/30",
          logoBg: "#552b0d",
          logoShadow: "rgba(139,78,31,0.35)",
          logoPulseBase: "rgba(139, 78, 31, 0.35)",
          logoPulseGlow: "rgba(244, 214, 189, 0.42)",
          logoClassName: "object-contain transition duration-700 hover:scale-105",
          logoSrc: "/adisorn-logo.png",
          eyebrow: "Studio Booking Management",
          subEyebrow: "",
          title: "Adisorn Wedding Studio",
          titleGradient: "from-white via-[#f4d6bd] to-white",
          description:
            "ระบบจัดการงาน ลูกค้า ใบจอง ปฏิทิน รายได้ และข้อมูลทั้งหมดของสตูดิโอ",
        };

    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080808] px-4 py-5 text-white">
        <div className="absolute inset-0">
          <div
            className={`absolute inset-0 scale-105 bg-cover bg-center ${welcomeConfig.backgroundOpacity} blur-[1px]`}
            style={{ backgroundImage: `url('${welcomeConfig.backgroundImage}')` }}
          />
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="absolute inset-0"
            style={{ background: welcomeConfig.radial }}
          />
          <div
            className={`welcome-orb absolute left-[-8%] top-[-14%] h-[430px] w-[430px] rounded-full ${welcomeConfig.orbOne} blur-[125px]`}
          />
          <div
            className={`welcome-orb-delayed absolute bottom-[-18%] right-[-8%] h-[470px] w-[470px] rounded-full ${welcomeConfig.orbTwo} blur-[135px]`}
          />
          <div className="absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:42px_42px]" />
        </div>

        <section className="welcome-card relative z-10 w-full max-w-[760px] px-6 py-8 text-center sm:px-10 sm:py-10">
          <div className="logo-entrance relative mx-auto flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
            <div
              className={`absolute inset-[-10px] rounded-full border ${welcomeConfig.logoBorder}`}
            />
            <div className="logo-ring absolute inset-[-18px] rounded-full border border-dashed border-white/15" />
            <div className="logo-flash pointer-events-none absolute inset-[-28px] rounded-full bg-[conic-gradient(from_0deg,transparent,rgba(216,196,158,0.55),transparent_22%,transparent)] blur-sm" />
            <div
              className="logo-core relative h-full w-full overflow-hidden rounded-full border border-white/25"
              style={{
                backgroundColor: welcomeConfig.logoBg,
                boxShadow: `0 0 45px ${welcomeConfig.logoShadow}`,
              }}
            >
              <Image
                src={welcomeConfig.logoSrc}
                alt={theme.name}
                fill
                sizes="128px"
                className={welcomeConfig.logoClassName}
              />
            </div>
          </div>

          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/65 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-xs">
            {welcomeConfig.eyebrow}
          </p>

          {welcomeConfig.subEyebrow && (
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.28em] text-white/70 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-base">
              {welcomeConfig.subEyebrow}
            </p>
          )}

          <h1 className="mt-3 leading-[1.02] tracking-[-0.04em] drop-shadow-[0_5px_24px_rgba(0,0,0,0.85)]">
            <span className="block text-3xl font-semibold text-white/90 sm:text-4xl">
              Welcome to
            </span>
            <span
              className={`mt-2 block whitespace-nowrap bg-gradient-to-r ${welcomeConfig.titleGradient} bg-clip-text text-4xl font-black text-transparent sm:text-6xl`}
            >
              {welcomeConfig.title}
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-white/75 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-base">
            {welcomeConfig.description}
          </p>

          <button
            type="button"
            onClick={startSystem}
            className="group relative mt-7 inline-flex min-w-[220px] items-center justify-center gap-3 overflow-hidden rounded-full border border-white/30 bg-white/90 px-7 py-4 text-sm font-black text-zinc-950 shadow-[0_16px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_20px_55px_rgba(0,0,0,0.45)] active:translate-y-0 sm:text-base"
          >
            เริ่มใช้งานระบบ
            <span className="transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </button>

          <p className="mt-4 text-[10px] text-white/50 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-xs">
            เข้าสู่ระบบโดย {currentUser?.name || currentUser?.username}
          </p>
        </section>
        <style jsx>{`
          .welcome-card {
            animation: welcomeIn 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
            text-shadow: 0 3px 18px rgba(0, 0, 0, 0.65);
          }
          @keyframes welcomeIn {
            from {
              opacity: 0;
              transform: translateY(18px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes logoEntrance {
            0% {
              opacity: 0;
              transform: scale(0.45) rotate(-160deg);
              filter: blur(14px) brightness(2.2);
            }
            58% {
              opacity: 1;
              transform: scale(1.12) rotate(10deg);
              filter: blur(0) brightness(1.45);
            }
            78% {
              transform: scale(0.96) rotate(-4deg);
              filter: brightness(1.1);
            }
            100% {
              opacity: 1;
              transform: scale(1) rotate(0deg);
              filter: blur(0) brightness(1);
            }
          }
          @keyframes ringBurst {
            0% {
              opacity: 0;
              transform: scale(0.35) rotate(-220deg);
            }
            65% {
              opacity: 1;
              transform: scale(1.14) rotate(20deg);
            }
            100% {
              opacity: 1;
              transform: scale(1) rotate(0deg);
            }
          }
          @keyframes flashSweep {
            0% {
              opacity: 0;
              transform: rotate(-90deg) scale(0.65);
            }
            35% {
              opacity: 1;
            }
            100% {
              opacity: 0;
              transform: rotate(250deg) scale(1.2);
            }
          }
          @keyframes logoPulse {
            0%,
            100% {
              box-shadow: 0 0 38px ${welcomeConfig.logoPulseBase};
            }
            50% {
              box-shadow: 0 0 58px ${welcomeConfig.logoPulseGlow};
            }
          }
          .logo-entrance {
            animation: logoEntrance 1.15s cubic-bezier(0.16, 1, 0.3, 1) both,
              logoFloat 5s ease-in-out 1.2s infinite;
          }
          .logo-core {
            animation: logoPulse 2.8s ease-in-out 1.2s infinite;
          }
          .logo-ring {
            animation: ringBurst 1.15s cubic-bezier(0.16, 1, 0.3, 1) both,
              ringSpin 18s linear 1.2s infinite;
          }
          .logo-flash {
            animation: flashSweep 1.05s ease-out 0.18s both;
          }
          @keyframes logoFloat {
            0%,
            100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-8px);
            }
          }
          @keyframes ringSpin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen"
      style={{
        background: `linear-gradient(180deg, ${theme.background} 0%, ${theme.card} 48%, ${theme.background} 100%)`,
        color: theme.text,
      }}
    >
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          className="sticky top-0 hidden h-screen overflow-y-auto px-4 py-5 lg:block"
          style={{ backgroundColor: theme.sidebarBg }}
        >
          <SidebarContent
            actionCards={actionCards}
            countsReady={countsReady}
            currentUser={currentUser}
            dashboardPath={dashboardPath}
            onLogout={logout}
            onNavigate={navigate}
            theme={theme}
          />
        </aside>

        <div className="min-w-0">
          <header
            className="sticky top-0 z-30 border-b px-4 py-3 backdrop-blur-xl lg:hidden"
            style={{
              backgroundColor: `${theme.background}E6`,
              borderColor: theme.border,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border bg-white"
                style={{ borderColor: theme.border, color: theme.primary }}
              >
                <Icon name="menu" className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white">
                  <Image src={theme.logo} alt={theme.name} fill sizes="40px" className="object-contain p-1" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{theme.shortName}</p>
                  <p className="truncate text-[11px] font-semibold" style={{ color: theme.muted }}>
                    Dashboard
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={refreshDashboardCounts}
                disabled={isRefreshingCounts}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-white disabled:opacity-50"
                style={{ backgroundColor: theme.primary }}
              >
                <Icon name="refresh" className="h-5 w-5" />
              </button>
            </div>
          </header>

          {isMobileMenuOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                aria-label="Close menu"
                className="absolute inset-0 bg-black/40"
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <aside
                className="relative h-full w-[min(86vw,340px)] overflow-y-auto px-4 py-5 shadow-2xl"
                style={{ backgroundColor: theme.sidebarBg }}
              >
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"
                  >
                    <Icon name="close" className="h-5 w-5" />
                  </button>
                </div>
                <SidebarContent
                  actionCards={actionCards}
                  countsReady={countsReady}
                  currentUser={currentUser}
                  dashboardPath={dashboardPath}
                  isMobile
                  onLogout={logout}
                  onNavigate={navigate}
                  theme={theme}
                />
              </aside>
            </div>
          )}

          <section className="mx-auto max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            <div
              className="overflow-hidden rounded-[18px] border p-5 shadow-sm sm:p-6 lg:p-7"
              style={{
                background: theme.card,
                borderColor: theme.border,
                boxShadow: `0 18px 46px ${theme.shadow}`,
              }}
            >
              <div className="mb-5 h-1.5 w-28 rounded-full" style={{ backgroundColor: theme.accent }} />
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase" style={{ color: theme.accent }}>
                    {theme.tagline}
                  </p>
                  <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
                    {theme.name} Dashboard
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: theme.muted }}>
                    ภาพรวมงาน ใบจอง ลูกค้า รายได้ และแจ้งเตือนสำคัญในที่เดียว
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <BrandButton
                    theme={theme}
                    onClick={refreshDashboardCounts}
                    disabled={isRefreshingCounts}
                    variant="secondary"
                  >
                    <Icon name="refresh" className="h-5 w-5" />
                    {isRefreshingCounts ? "กำลังรีเฟรช" : "รีเฟรชข้อมูล"}
                  </BrandButton>
                  <BrandButton theme={theme} onClick={() => navigate(bookingPath)}>
                    <Icon name="document" className="h-5 w-5" />
                    สร้างใบจอง
                  </BrandButton>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {statCards.map(([label, value, unit, icon]) => (
                <article
                  key={label}
                  className="rounded-[18px] border p-5 shadow-sm"
                  style={{
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    boxShadow: `0 10px 28px ${theme.shadow}`,
                  }}
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: theme.accentSoft, color: theme.primary }}
                  >
                    <Icon name={icon} className="h-6 w-6" />
                  </div>
                  <p className="mt-5 text-sm font-bold" style={{ color: theme.muted }}>
                    {label}
                  </p>
                  <div className="mt-2 flex items-end gap-2">
                    <h2 className="text-4xl font-black" style={{ color: theme.primaryDark }}>
                      {value}
                    </h2>
                    <span className="pb-1 text-sm font-bold" style={{ color: theme.muted }}>
                      {unit}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section
                className="rounded-[18px] border p-4 shadow-sm sm:p-5"
                style={{ backgroundColor: theme.card, borderColor: theme.border }}
              >
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase" style={{ color: theme.accent }}>
                      Main Menu
                    </p>
                    <h2 className="mt-1 text-2xl font-black">เมนูหลัก</h2>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: theme.muted }}>
                    {mainMenuCards.length} เครื่องมือ
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {mainMenuCards.map(([href, icon, title, description, badgeCount]) => (
                    <button
                      key={href}
                      type="button"
                      onClick={() => navigate(href)}
                      className="group relative min-h-[154px] rounded-[16px] border p-4 pr-12 text-left transition hover:-translate-y-1"
                      style={{
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        boxShadow: `0 10px 26px ${theme.shadow}`,
                      }}
                    >
                      <DashboardBadge count={badgeCount} ready={countsReady} theme={theme} />
                      <span
                        className="flex h-12 w-12 items-center justify-center rounded-2xl transition group-hover:scale-105"
                        style={{ backgroundColor: theme.accentSoft, color: theme.primary }}
                      >
                        <Icon name={icon} className="h-6 w-6" />
                      </span>
                      <span className="mt-5 block text-lg font-black">{title}</span>
                      <span className="mt-1 block text-sm leading-5" style={{ color: theme.muted }}>
                        {description}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <aside className="space-y-5">
                <section
                  className="rounded-[18px] border p-5 shadow-sm"
                  style={{ backgroundColor: theme.card, borderColor: theme.border }}
                >
                  <p className="text-xs font-black uppercase" style={{ color: theme.accent }}>
                    Quick Actions
                  </p>
                  <h2 className="mt-1 text-2xl font-black">ทางลัด</h2>
                  <div className="mt-4 grid gap-2">
                    {quickActions.map(([href, icon, title]) => (
                      <button
                        key={href}
                        type="button"
                        onClick={() => navigate(href)}
                        className="flex min-h-12 items-center gap-3 rounded-2xl border px-3 text-left text-sm font-bold transition hover:-translate-y-0.5"
                        style={{ borderColor: theme.border, color: theme.text }}
                      >
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-xl"
                          style={{ backgroundColor: theme.accentSoft, color: theme.primary }}
                        >
                          <Icon name={icon} className="h-5 w-5" />
                        </span>
                        {title}
                      </button>
                    ))}
                  </div>
                </section>

                <section
                  className="rounded-[18px] border p-5 shadow-sm"
                  style={{ backgroundColor: theme.card, borderColor: theme.border }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase" style={{ color: theme.accent }}>
                        Latest Jobs
                      </p>
                      <h2 className="mt-1 text-2xl font-black">งานล่าสุด</h2>
                    </div>
                    {upcomingJobs > 0 && (
                      <span
                        className="rounded-full px-3 py-1 text-xs font-black text-white"
                        style={{ backgroundColor: theme.danger }}
                      >
                        {upcomingJobs}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-3">
                    {latestActivity.length === 0 ? (
                      <p className="rounded-2xl border px-4 py-5 text-center text-sm font-semibold" style={{ borderColor: theme.border, color: theme.muted }}>
                        ยังไม่มีรายการที่ต้องติดตาม
                      </p>
                    ) : (
                      latestActivity.map((item, index) => (
                        <div
                          key={`${item.title}-${index}`}
                          className="flex gap-3 rounded-2xl border p-3"
                          style={{ borderColor: theme.border }}
                        >
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                            style={{ backgroundColor: theme.accentSoft, color: theme.primary }}
                          >
                            <Icon name={item.icon} className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black">{item.title}</p>
                            <p className="mt-0.5 text-xs font-semibold" style={{ color: theme.muted }}>
                              {item.detail}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const CLOSED_STATUSES = new Set(["completed", "finished", "closed", "done"]);
const DASHBOARD_THEME_KEY = "pharadol_dashboard_theme";

const isClosedJob = (item) => {
  const status = String(item?.status || item?.jobStatus || item?.bookingStatus || "")
    .trim()
    .toLowerCase();

  return CLOSED_STATUSES.has(status);
};

const Icon = ({ name, className = "h-6 w-6" }) => {
  const paths = {
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
    alert: (
      <>
        <path d="M12 3 2.8 19h18.4L12 3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
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

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [archiveCount, setArchiveCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [todayJobs, setTodayJobs] = useState(0);
  const [upcomingJobs, setUpcomingJobs] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [dashboardTheme, setDashboardTheme] = useState("clean");
  const [showWelcome, setShowWelcome] = useState(null);

  useEffect(() => {
    const loadDashboardData = (savedUser) => {
      const parsedUser = {
        ...savedUser,
        brandId: "pharadol",
        brandName: "PHARADOL PRODUCTION",
      };

      setCurrentUser(parsedUser);

      const customers = JSON.parse(
        localStorage.getItem("pharadol_customers") || "[]"
      );
      const archives = JSON.parse(
        localStorage.getItem("pharadol_archives") || "[]"
      );
      const trash = JSON.parse(
        localStorage.getItem("pharadol_trash") || "[]"
      );

      const safeCustomers = Array.isArray(customers) ? customers : [];
      const safeArchives = Array.isArray(archives) ? archives : [];
      const safeTrash = Array.isArray(trash) ? trash : [];

      setCustomerCount(safeCustomers.length);
      setArchiveCount(safeArchives.length + safeCustomers.filter(isClosedJob).length);
      setTrashCount(safeTrash.length);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let todayCount = 0;
      let upcomingCount = 0;
      const upcomingAlerts = [];

      safeCustomers.forEach((item) => {
        if (!item.eventDate) return;

        const eventDate = new Date(item.eventDate);
        eventDate.setHours(0, 0, 0, 0);

        const diffDays = Math.floor(
          (eventDate - today) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === 0) todayCount += 1;

        if (diffDays > 0 && diffDays <= 7) {
          upcomingCount += 1;
          upcomingAlerts.push({
            customerName: item.customerName,
            service: item.service,
            diffDays,
          });
        }
      });

      setTodayJobs(todayCount);
      setUpcomingJobs(upcomingCount);
      setAlerts(
        upcomingAlerts.sort((a, b) => a.diffDays - b.diffDays)
      );
    };

    const verifyAccess = () => {
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
        const isAdmin = savedUser?.role === "ADMIN";
        const hasBrandAccess = normalizedBrands.includes("pharadol");
        const accountIsActive = savedUser?.active !== false;
        const brandIsCorrect =
          activeBrand === "pharadol" && (isAdmin || hasBrandAccess);
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
        loadDashboardData(savedUser);
        setIsAuthorized(true);
        return true;
      } catch (error) {
        console.error("Dashboard authorization error:", error);
        sessionStorage.clear();
        window.location.replace("/login");
        return false;
      }
    };

    if (!verifyAccess()) return;

    let activityTimer;

    const updateActivity = () => {
      window.clearTimeout(activityTimer);
      activityTimer = window.setTimeout(() => {
        sessionStorage.setItem("lastActivity", String(Date.now()));
      }, 500);
    };

    const handleStorage = (event) => {
      if (
        event.key === "pharadol_customers" ||
        event.key === "pharadol_archives" ||
        event.key === "pharadol_trash"
      ) {
        verifyAccess();
      }
    };

    const handleFocus = () => {
      verifyAccess();
    };

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(sessionCheck);
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    const loadDashboardTheme = () => {
      const savedTheme = localStorage.getItem(DASHBOARD_THEME_KEY);
      setDashboardTheme(
        ["aurora", "classic", "neon"].includes(savedTheme)
          ? savedTheme
          : "clean"
      );
    };

    loadDashboardTheme();
    window.addEventListener("focus", loadDashboardTheme);
    window.addEventListener("storage", loadDashboardTheme);

    return () => {
      window.removeEventListener("focus", loadDashboardTheme);
      window.removeEventListener("storage", loadDashboardTheme);
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    const hasSeenWelcome =
      sessionStorage.getItem("pharadolWelcomeSeen") === "true";

    const timer = window.setTimeout(() => {
      setShowWelcome(!hasSeenWelcome);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isAuthorized]);

  const startPharadolSystem = () => {
    sessionStorage.setItem("pharadolWelcomeSeen", "true");
    sessionStorage.setItem("lastActivity", String(Date.now()));
    setShowWelcome(false);
  };

  const logout = () => {
    sessionStorage.clear();
    window.location.replace("/login");
  };

  if (!isAuthorized || !currentUser || showWelcome === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }


  if (showWelcome) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080808] px-4 py-5 text-white">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center opacity-35 blur-[1px]"
            style={{ backgroundImage: "url('/pharadol-wedding-bg.jpg')" }}
          />
          <div className="absolute inset-0 bg-black/72" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(22,78,51,0.18),transparent_48%)]" />
          <div className="welcome-orb absolute left-[-8%] top-[-14%] h-[430px] w-[430px] rounded-full bg-emerald-700/8 blur-[125px]" />
          <div className="welcome-orb-delayed absolute bottom-[-18%] right-[-8%] h-[470px] w-[470px] rounded-full bg-slate-500/8 blur-[135px]" />
          <div className="absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:42px_42px]" />
        </div>

        <section className="welcome-card relative z-10 w-full max-w-[760px] px-6 py-8 text-center sm:px-10 sm:py-10">
          <div className="logo-entrance relative mx-auto flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
            <div className="absolute inset-[-10px] rounded-full border border-[#b89a68]/25" />
            <div className="logo-ring absolute inset-[-18px] rounded-full border border-dashed border-white/15" />
            <div className="logo-flash pointer-events-none absolute inset-[-28px] rounded-full bg-[conic-gradient(from_0deg,transparent,rgba(216,196,158,0.55),transparent_22%,transparent)] blur-sm" />
            <div className="logo-core relative h-full w-full overflow-hidden rounded-full border border-white/25 bg-[#10291d] shadow-[0_0_45px_rgba(16,41,29,0.5)]">
              <Image
                src="/pharadol-logo.jpeg"
                alt="PHARADOL PRODUCTION"
                fill
                sizes="128px"
                className="scale-[1.38] object-cover transition duration-700 hover:scale-[1.45]"
              />
            </div>
          </div>

          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/65 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-xs">
            PHARADOL PRODUCTION Booking Management
          </p>

          <p className="mt-3 text-sm font-semibold uppercase tracking-[0.28em] text-white/70 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-base">
            FILM &amp; STILL
          </p>

          <h1 className="mt-3 leading-[1.02] tracking-[-0.04em] drop-shadow-[0_5px_24px_rgba(0,0,0,0.85)]">
            <span className="block text-3xl font-semibold text-white/90 sm:text-4xl">
              Welcome to
            </span>
            <span className="mt-2 block whitespace-nowrap bg-gradient-to-r from-white via-[#e8ded0] to-white bg-clip-text text-4xl font-black text-transparent sm:text-6xl">
              PHARADOL PRODUCTION
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-white/75 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-base">
            ระบบจัดการงาน ลูกค้า ใบจอง ปฏิทิน รายได้ และข้อมูลทั้งหมดของ PHARADOL PRODUCTION
          </p>

          <button
            type="button"
            onClick={startPharadolSystem}
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
            0%, 100% {
              box-shadow: 0 0 38px rgba(16, 41, 29, 0.38);
            }
            50% {
              box-shadow: 0 0 54px rgba(184, 154, 104, 0.28);
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
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
          @keyframes ringSpin {
            to { transform: rotate(360deg); }
          }
          @keyframes orbMove {
            from { transform: translate3d(0, 0, 0) scale(1); }
            to { transform: translate3d(35px, 22px, 0) scale(1.08); }
          }
        `}</style>
      </main>
    );
  }


  const statCards = [
    ["ลูกค้าปัจจุบัน", customerCount, "รายการ", "customers"],
    ["งานที่ปิดแล้ว", archiveCount, "รายการ", "archive"],
    ["รายการในถังขยะ", trashCount, "รายการ", "trash"],
    ["งานวันนี้", todayJobs, "งาน", "today"],
    ["งานใน 7 วัน", upcomingJobs, "งาน", "upcoming"],
  ];

  const actionCards = [
    ["/pharadol", "document", "ระบบสร้างใบจอง", "สร้างใบจองใหม่"],
    ["/pharadol/customers", "customers", "ข้อมูลลูกค้า", "รายชื่อลูกค้าทั้งหมด"],
    ["/pharadol/archives", "archive", "คลังข้อมูล", "ข้อมูลที่จัดเก็บแล้ว"],
    ["/pharadol/calendar", "calendar", "ปฏิทินงาน", "ตารางงานทั้งหมด"],
    ["/pharadol/trash", "trash", "ถังขยะ", "รายการที่ถูกลบ"],
    ["/pharadol/income", "income", "รายได้", "รายได้ทั้งหมด"],
    ["/pharadol/reports", "reports", "รายงาน", "สถิติและรายงานธุรกิจ"],
    ["/pharadol/notifications", "bell", "แจ้งเตือน", "งานใกล้ถึงกำหนด"],
    ["/pharadol/settings", "settings", "ตั้งค่าระบบ", "จัดการข้อมูลระบบ"],
    ["/pharadol/mail", "mail", "ระบบส่งอีเมล", "ระบบส่งอีเมล"],
  ];

  const actionCardImages = {
    document: "/dashboard-icons/document-card.png",
    customers: "/dashboard-icons/customers-card.png",
    archive: "/dashboard-icons/archive-card.png",
    calendar: "/dashboard-icons/calendar-card.png",
    trash: "/dashboard-icons/trash-card.png",
    income: "/dashboard-icons/income-card.png",
    reports: "/dashboard-icons/reports-card.png",
    bell: "/dashboard-icons/bell-card.png",
    settings: "/dashboard-icons/settings-card.png",
    mail: "/dashboard-icons/mail-card.png",
  };

  const auroraIconImages = {
    brand: "/aurora-icons/brand-a.png",
    document: "/aurora-icons/document.png",
    customers: "/aurora-icons/customers.png",
    archive: "/aurora-icons/archive.png",
    calendar: "/aurora-icons/calendar.png",
    trash: "/aurora-icons/trash.png",
    income: "/aurora-icons/income.png",
    reports: "/aurora-icons/reports.png",
    bell: "/aurora-icons/bell.png",
    settings: "/aurora-icons/settings.png",
    mail: "/aurora-icons/mail.png",
  };

  const isNeonTheme = dashboardTheme === "neon";
  const isAuroraTheme = dashboardTheme === "aurora";
  const isClassicTheme = dashboardTheme === "classic";

  const actionCardEmojis = {
    document: "📄",
    customers: "👥",
    archive: "📦",
    calendar: "📅",
    trash: "🗑️",
    income: "💰",
    reports: "📊",
    bell: "🔔",
    settings: "⚙️",
    mail: "✉️",
  };

  if (isAuroraTheme) {
    const totalBookings = customerCount + archiveCount;

    return (
      <main className="min-h-screen overflow-hidden bg-[#061327] p-6 text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(45,156,255,0.28),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(128,91,255,0.22),transparent_28%),linear-gradient(135deg,#081b35_0%,#061123_48%,#030816_100%)]" />
        <div className="pointer-events-none fixed inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:46px_46px]" />

        <section className="relative mx-auto grid min-h-[calc(100vh-48px)] max-w-[1760px] grid-cols-1 gap-5 rounded-[28px] border border-white/20 bg-white/[0.035] p-4 shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:p-6 xl:grid-cols-[250px_1fr] xl:gap-8 xl:rounded-[34px] xl:p-8">
          <aside className="flex min-h-full flex-col rounded-[24px] border border-sky-200/20 bg-sky-200/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] xl:rounded-[30px]">
            <div className="mb-10 flex items-center gap-4 px-2">
              <div className="relative h-14 w-14">
                <Image
                  src={auroraIconImages.brand}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-contain drop-shadow-[0_0_22px_rgba(56,189,248,0.72)]"
                />
              </div>
              <div>
                <p className="text-lg font-black tracking-wide">DASHBOARD</p>
                <p className="text-xs font-semibold text-white/45">
                  {currentUser.brandName || "PHARADOL"}
                </p>
              </div>
            </div>

            <nav className="grid gap-3 sm:grid-cols-2 xl:block xl:space-y-3">
              {actionCards.map(([href, icon, title]) => {
                const active = icon === "document";

                return (
                  <button
                    key={href}
                    type="button"
                    onClick={() => (window.location.href = href)}
                    className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-sm font-semibold transition ${
                      active
                        ? "border border-sky-200/35 bg-white/14 text-white shadow-[0_0_28px_rgba(56,189,248,0.22)]"
                        : "text-white/72 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon name={icon} className="h-6 w-6" />
                    <span>{title}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-4 rounded-2xl border border-emerald-200/20 bg-white/[0.07] p-4 xl:mt-auto">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-300/15 text-emerald-200">
                  <Icon name="settings" className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/65">
                    สถานะระบบ
                  </p>
                  <p className="mt-1 text-sm font-bold text-emerald-300">
                    • ปกติ
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-4xl font-black tracking-tight">
                  ภาพรวมระบบ
                </h1>
                <p className="mt-2 text-white/55">
                  ยินดีต้อนรับกลับมา, {currentUser?.name || currentUser?.username}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden h-14 min-w-[360px] items-center gap-3 rounded-full border border-white/18 bg-white/[0.08] px-5 text-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] lg:flex">
                  <span className="text-xl">⌕</span>
                  <span>ค้นหา...</span>
                </div>
                <button
                  type="button"
                  onClick={() => (window.location.href = "/pharadol/notifications")}
                  className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/18 bg-white/[0.08] text-white/78"
                >
                  <Icon name="bell" className="h-6 w-6" />
                  {upcomingJobs > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-7 min-w-7 items-center justify-center rounded-full bg-violet-500 px-2 text-xs font-black">
                      {upcomingJobs}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-full border border-white/18 bg-white/[0.08] px-5 py-4 text-sm font-bold text-white"
                >
                  Admin ⌄
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {actionCards.slice(0, 8).map(([href, icon, title, description]) => (
                <button
                  key={href}
                  type="button"
                  onClick={() => (window.location.href = href)}
                  className="group relative min-h-[260px] overflow-hidden rounded-[24px] border border-white/20 bg-white/[0.085] p-8 text-left shadow-[0_22px_70px_rgba(0,0,0,0.25)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/38"
                >
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.18),transparent_26%)] opacity-80" />
                  <span className="relative block h-28 w-28">
                    <Image
                      src={auroraIconImages[icon]}
                      alt=""
                      fill
                      sizes="112px"
                      className="object-contain mix-blend-screen drop-shadow-[0_0_24px_rgba(96,165,250,0.42)]"
                    />
                  </span>
                  <span className="relative mt-8 block text-2xl font-black">
                    {title}
                  </span>
                  <span className="relative mt-2 block text-base text-white/62">
                    {description}
                  </span>
                  <span className="relative mt-6 inline-flex items-center gap-3 text-sm font-bold text-sky-300">
                    เปิดใช้งาน <span className="transition group-hover:translate-x-1">→</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {actionCards.slice(8).map(([href, icon, title, description]) => (
                <button
                  key={href}
                  type="button"
                  onClick={() => (window.location.href = href)}
                  className="group flex min-h-[150px] items-center gap-8 rounded-[24px] border border-white/20 bg-white/[0.08] p-8 text-left shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl transition duration-300 hover:-translate-y-1"
                >
                  <span className="relative block h-28 w-28 shrink-0">
                    <Image
                      src={auroraIconImages[icon]}
                      alt=""
                      fill
                      sizes="112px"
                      className="object-contain mix-blend-screen drop-shadow-[0_0_24px_rgba(96,165,250,0.42)]"
                    />
                  </span>
                  <span>
                    <span className="block text-2xl font-black">{title}</span>
                    <span className="mt-2 block text-white/58">{description}</span>
                    <span className="mt-5 inline-flex text-sm font-bold text-sky-300">
                      เปิดใช้งาน →
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <section className="mt-8 grid grid-cols-1 overflow-hidden rounded-[24px] border border-white/20 bg-white/[0.08] shadow-[0_18px_70px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["document", totalBookings, "ใบจองทั้งหมด", "+12.5%"],
                ["customers", customerCount, "ลูกค้าทั้งหมด", "+8.1%"],
                ["calendar", todayJobs, "งานวันนี้", `+${todayJobs} งาน`],
                ["income", "฿248,950", "รายได้เดือนนี้", "+15.3%"],
              ].map(([icon, value, label, trend]) => (
                <div
                  key={label}
                  className="flex items-center gap-5 border-r border-white/10 p-6 last:border-r-0"
                >
                  <div className="relative h-16 w-16 shrink-0">
                    <Image
                      src={auroraIconImages[icon]}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-contain mix-blend-screen drop-shadow-[0_0_16px_rgba(96,165,250,0.38)]"
                    />
                  </div>
                  <div>
                    <p className="text-3xl font-black">{value}</p>
                    <p className="mt-1 text-sm text-white/55">{label}</p>
                    <p className="mt-1 text-sm font-bold text-emerald-300">
                      {trend} ↗
                    </p>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </section>
      </main>
    );
  }

  if (isClassicTheme) {
    return (
      <div className="min-h-screen bg-zinc-100 p-10 text-zinc-950">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">
              {currentUser.brandName || "PHARADOL PRODUCTION"}
            </h1>
            <p className="mt-2 text-zinc-500">ระบบจัดการงานและข้อมูลลูกค้า</p>
          </div>

          <button
            onClick={logout}
            className="rounded-xl bg-red-500 px-5 py-3 font-semibold text-white"
          >
            ออกจากระบบ
          </button>
        </div>

        <div className="mx-auto mb-10 grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-5">
          {statCards.map(([label, value, unit]) => (
            <div
              key={label}
              className="rounded-3xl bg-white p-6 text-center shadow-xl"
            >
              <p className="text-zinc-500">{label}</p>
              <h2 className="mt-2 text-4xl font-bold">{value}</h2>
              <p className="mt-2 text-zinc-500">{unit}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mb-10 max-w-7xl rounded-3xl bg-white p-6 shadow-xl">
          <h2 className="mb-4 text-2xl font-bold">⚠️ งานใกล้ถึงวัน</h2>
          {alerts.length === 0 ? (
            <p className="text-zinc-500">ไม่มีงานใน 7 วันข้างหน้า</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((job, index) => (
                <div
                  key={`${job.customerName}-${index}`}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <div>
                    <p className="font-semibold">{job.customerName}</p>
                    <p className="text-sm text-zinc-500">{job.service}</p>
                  </div>
                  <div className="font-bold text-emerald-600">
                    อีก {job.diffDays} วัน
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 md:grid-cols-3">
          {actionCards.map(([href, icon, title, description]) => (
            <div
              key={href}
              onClick={() => (window.location.href = href)}
              className="cursor-pointer rounded-3xl bg-white p-10 text-center shadow-xl transition hover:scale-105"
            >
              <div className="mb-4 text-7xl">{actionCardEmojis[icon]}</div>
              <h2 className="text-2xl font-bold">{title}</h2>
              <p className="mt-3 text-zinc-500">{description}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main
      className={`min-h-screen ${isNeonTheme ? "text-white" : "text-zinc-950"}`}
      style={{
        background: isNeonTheme
          ? "radial-gradient(circle at 18% 0%, rgba(22,167,255,0.16), transparent 34%), radial-gradient(circle at 82% 12%, rgba(179,92,255,0.14), transparent 32%), linear-gradient(180deg, #081018 0%, #04070c 42%, #020408 100%)"
          : "radial-gradient(circle at 12% 0%, rgba(255,255,255,0.92), transparent 30%), radial-gradient(circle at 86% 8%, rgba(226,232,240,0.88), transparent 28%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 48%, #f7f7f5 100%)",
      }}
    >
      <section className={`mx-auto px-4 pb-6 pt-6 text-center sm:px-6 md:px-8 ${isNeonTheme ? "max-w-[1840px]" : "max-w-[1680px]"}`}>
        <div className="mb-6 flex flex-col items-stretch gap-3 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div
            className={
              isNeonTheme
                ? "text-sm font-semibold text-white/55"
                : "rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-semibold text-zinc-500 shadow-sm backdrop-blur-xl"
            }
          >
            {currentUser?.name || currentUser?.username}
          </div>
          <button
            onClick={logout}
            className={
              isNeonTheme
                ? "rounded-full border border-white/10 bg-white px-5 py-2.5 text-sm font-semibold text-[#111317] transition hover:bg-white/90"
                : "rounded-full border border-zinc-200 bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.14)] transition hover:bg-zinc-800"
            }
          >
            ออกจากระบบ
          </button>
        </div>
        <p className={isNeonTheme ? "text-sm font-semibold text-white/45" : "text-xs font-bold uppercase tracking-[0.32em] text-zinc-400"}>
          Dashboard
        </p>
        <h1 className={isNeonTheme ? "mt-2 break-words text-3xl font-semibold sm:text-4xl md:text-6xl" : "mx-auto mt-3 max-w-5xl break-words text-3xl font-semibold leading-tight text-zinc-950 sm:text-4xl md:text-6xl"}>
          {currentUser.brandName || "PHARADOL PRODUCTION"}
        </h1>
        <p className={isNeonTheme ? "mx-auto mt-4 max-w-2xl text-lg font-medium leading-8 text-white/50" : "mx-auto mt-4 max-w-2xl text-base font-medium leading-8 text-zinc-500 md:text-lg"}>
          ระบบจัดการงาน ลูกค้า ใบจอง ปฏิทิน รายได้ และการแจ้งเตือนสำคัญของสตูดิโอ
        </p>
      </section>

      <section className={`mx-auto px-4 pb-10 sm:px-6 md:px-8 ${isNeonTheme ? "max-w-[1840px]" : "max-w-[1680px]"}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {statCards.map(([label, value, unit, icon]) => (
            <article
              key={label}
              className={isNeonTheme ? "rounded-[22px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.24)]" : "rounded-[24px] border border-white/80 bg-white/70 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl"}
            >
              <div className={isNeonTheme ? "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white" : "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm"}>
                <Icon name={icon} className="h-5 w-5" />
              </div>
              <p className={isNeonTheme ? "text-center text-sm font-semibold text-white/48" : "text-center text-sm font-semibold text-zinc-500"}>{label}</p>
              <h2 className={isNeonTheme ? "mt-2 text-center text-3xl font-semibold md:text-4xl" : "mt-2 text-center text-3xl font-semibold text-zinc-950 md:text-4xl"}>{value}</h2>
              <p className={isNeonTheme ? "mt-1 text-center text-sm font-medium text-white/42" : "mt-1 text-center text-sm font-medium text-zinc-400"}>{unit}</p>
            </article>
          ))}
        </div>

        <section className={isNeonTheme ? "mt-4 rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] md:p-6" : "mt-4 rounded-[30px] border border-white/80 bg-white/72 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl md:p-6"}>
          <div className="flex items-start gap-4">
            <div className={isNeonTheme ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white" : "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm"}>
              <Icon name="alert" className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className={isNeonTheme ? "text-2xl font-semibold" : "text-2xl font-semibold text-zinc-950"}>งานใกล้ถึงวัน</h2>
                <span className={isNeonTheme ? "text-sm font-semibold text-white/48" : "text-sm font-semibold text-zinc-400"}>{upcomingJobs} งานใน 7 วัน</span>
              </div>
              {alerts.length === 0 ? (
                <p className={isNeonTheme ? "mt-4 text-white/48" : "mt-4 text-zinc-500"}>ไม่มีงานใน 7 วันข้างหน้า</p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {alerts.map((job, index) => (
                    <div
                      key={`${job.customerName}-${index}`}
                      className={isNeonTheme ? "flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" : "flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"}
                    >
                      <div>
                        <p className={isNeonTheme ? "font-semibold" : "font-semibold text-zinc-950"}>{job.customerName}</p>
                        <p className={isNeonTheme ? "text-sm text-white/45" : "text-sm text-zinc-500"}>{job.service}</p>
                      </div>
                      <div className={isNeonTheme ? "rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#111317]" : "rounded-full bg-zinc-950 px-3 py-1 text-sm font-semibold text-white"}>
                        อีก {job.diffDays} วัน
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className={isNeonTheme ? "mx-auto mt-6 grid max-w-[1640px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "mx-auto mt-6 grid max-w-[1500px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"}>
          {actionCards.map(([href, icon, title, description]) => {
            if (isNeonTheme) {
              const cardImage = actionCardImages[icon];
              return (
                <button
                  key={href}
                  type="button"
                  onClick={() => (window.location.href = href)}
                  className="group relative block aspect-[431/475] w-full appearance-none overflow-hidden rounded-[20px] p-0 text-left shadow-[0_28px_80px_rgba(0,0,0,0.55)] transition duration-300 hover:-translate-y-1"
                >
                  <Image
                    src={cardImage}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="rounded-[20px] object-fill transition duration-300 group-hover:scale-[1.015]"
                  />
                  <span className="sr-only">
                    {title} {description}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={href}
                type="button"
                onClick={() => (window.location.href = href)}
                className="group flex min-h-[210px] flex-col justify-between rounded-[28px] border border-white/85 bg-white/74 p-5 text-left shadow-[0_22px_60px_rgba(15,23,42,0.09)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-700 transition group-hover:border-zinc-300 group-hover:bg-zinc-950 group-hover:text-white">
                  <Icon name={icon} className="h-7 w-7" />
                </span>
                <span>
                  <span className="block text-xl font-semibold text-zinc-950">
                    {title}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-zinc-500">
                    {description}
                  </span>
                </span>
                <span className="text-sm font-semibold text-zinc-400 transition group-hover:text-zinc-950">
                  เปิดใช้งาน →
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [archiveCount, setArchiveCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [todayJobs, setTodayJobs] = useState(0);
  const [upcomingJobs, setUpcomingJobs] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
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
      setArchiveCount(safeArchives.length);
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
              <img
                src="/pharadol-logo.jpeg"
                alt="PHARADOL PRODUCTION"
                className="h-full w-full scale-[1.38] object-cover transition duration-700 hover:scale-[1.45]"
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


  return (
    <div className="min-h-screen bg-zinc-100 p-10">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">
            {currentUser.brandName || "ระบบจัดการสตูดิโอ"}
          </h1>
          <p className="mt-2 text-zinc-500">ระบบจัดการงานและข้อมูลลูกค้า</p>
        </div>

        <button
          onClick={logout}
          className="rounded-xl bg-red-500 px-5 py-3 text-white"
        >
          ออกจากระบบ
        </button>
      </div>

      <div className="mx-auto mb-10 grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-5">
        {[
          ["ลูกค้าปัจจุบัน", customerCount, "รายการ"],
          ["งานที่ปิดแล้ว", archiveCount, "รายการ"],
          ["รายการในถังขยะ", trashCount, "รายการ"],
          ["งานวันนี้", todayJobs, "งาน"],
          ["งานใน 7 วัน", upcomingJobs, "งาน"],
        ].map(([label, value, unit]) => (
          <div key={label} className="rounded-3xl bg-white p-6 text-center shadow-xl">
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
        {[
          ["/pharadol", "📄", "ระบบสร้างใบจอง", "สร้างใบจองใหม่"],
          ["/pharadol/customers", "👥", "ข้อมูลลูกค้า", "รายชื่อลูกค้าทั้งหมด"],
          ["/pharadol/archives", "📦", "คลังข้อมูล", "ข้อมูลที่จัดเก็บแล้ว"],
          ["/pharadol/calendar", "📅", "ปฏิทินงาน", "ตารางงานทั้งหมด"],
          ["/pharadol/trash", "🗑️", "ถังขยะ", "รายการที่ถูกลบ"],
          ["/pharadol/income", "💰", "รายได้", "รายได้ทั้งหมด"],
          ["/pharadol/reports", "📊", "รายงาน", "สถิติและรายงานธุรกิจ"],
          ["/pharadol/notifications", "🔔", "แจ้งเตือน", "งานใกล้ถึงกำหนด"],
          ["/pharadol/settings", "⚙️", "ตั้งค่าระบบ", "จัดการข้อมูลระบบ"],
        ].map(([href, icon, title, description]) => (
          <div
            key={href}
            onClick={() => (window.location.href = href)}
            className="cursor-pointer rounded-3xl bg-white p-10 text-center shadow-xl transition hover:scale-105"
          >
            <div className="mb-4 text-7xl">{icon}</div>
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="mt-3 text-zinc-500">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

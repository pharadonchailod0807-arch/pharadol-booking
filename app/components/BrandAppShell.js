"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  calculateDashboardCounts,
  emptyDashboardCounts,
} from "@/app/lib/dashboardCounts";
import { getBrandTheme } from "@/app/lib/brandThemes";
import {
  CUSTOMER_REQUESTS_EVENT,
  countNewCustomerRequests,
  readLocalCustomerRequests,
} from "@/app/lib/customerRequests";

const readArray = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
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
      badgeCount: counts.monthJobs,
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
      badgeCount: counts.upcoming7Days,
    },
    {
      href: `/${brandId}/mail`,
      icon: "mail",
      title: "ระบบส่งอีเมล",
      subtitle: "ประวัติอีเมล",
      badgeCount: counts.emailAttention,
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
    item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  );
};

const Badge = ({ count, theme }) => {
  const numericCount = Number(count || 0);
  if (numericCount <= 0) return null;

  return (
    <span
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black leading-none text-white"
      style={{ backgroundColor: theme.danger }}
    >
      {numericCount > 99 ? "99+" : numericCount}
    </span>
  );
};

const BrandSidebar = ({ brandId, onNavigate }) => {
  const pathname = usePathname();
  const theme = getBrandTheme(brandId);
  const [currentUser, setCurrentUser] = useState(null);
  const [counts, setCounts] = useState({
    ...emptyDashboardCounts,
    customerRequests: 0,
  });

  useEffect(() => {
    const loadShellState = () => {
      const savedUser = JSON.parse(sessionStorage.getItem("currentUser") || "null");
      setCurrentUser(savedUser);

      const nextCounts = calculateDashboardCounts({
        brandId,
        customers: readArray(`${brandId}_customers`),
        archiveItems: readArray(`${brandId}_archives`),
        trashItems: readArray(`${brandId}_trash`),
        emailHistory: readArray(`${brandId}_email_history`),
        hasBookingDraft: Boolean(localStorage.getItem(`${brandId}_bookingDraft`)),
      });

      setCounts({
        ...nextCounts,
        customerRequests: countNewCustomerRequests(
          readLocalCustomerRequests(brandId)
        ),
      });
    };

    loadShellState();

    const handleStorage = (event) => {
      if (
        !event.key ||
        event.key === "central_admin_users" ||
        event.key.startsWith(`${brandId}_`) ||
        event.key.startsWith(`pendingBookingPrefill_${brandId}`)
      ) {
        loadShellState();
      }
    };
    const handleCustomerRequestsEvent = () => loadShellState();

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CUSTOMER_REQUESTS_EVENT, handleCustomerRequestsEvent);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        CUSTOMER_REQUESTS_EVENT,
        handleCustomerRequestsEvent
      );
    };
  }, [brandId]);

  const menuItems = useMemo(() => buildMenuItems(brandId, counts), [brandId, counts]);

  const logout = () => {
    sessionStorage.clear();
    window.location.replace("/login");
  };

  return (
    <div className="flex h-full flex-col">
      <Link
        href={`/${brandId}/dashboard`}
        prefetch={false}
        onClick={onNavigate}
        className="flex items-center gap-3 px-1"
      >
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm">
          <Image
            src={theme.logo}
            alt={theme.name}
            fill
            sizes="56px"
            className="object-contain p-1.5"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-black text-white">
            {theme.shortName}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-semibold uppercase text-white/55">
            {theme.tagline}
          </p>
        </div>
      </Link>

      <nav className="mt-7 space-y-1.5">
        {menuItems.map((item) => {
          const active = isActiveMenu(pathname, item);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onNavigate}
              className="relative flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-white/10"
              style={{
                backgroundColor: active ? theme.sidebarActiveBg : "transparent",
                color: active ? "#FFFFFF" : "rgba(255, 255, 255, 0.68)",
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
                    ? theme.accent
                    : "rgba(255, 255, 255, 0.08)",
                  color: active ? theme.primaryDark : "rgba(255, 255, 255, 0.82)",
                }}
              >
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.title}</span>
                <span className="mt-0.5 block truncate text-[11px] font-semibold text-white/38">
                  {item.subtitle}
                </span>
              </span>
              <Badge count={item.badgeCount} theme={theme} />
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
          <p className="text-xs font-semibold uppercase text-white/45">
            Signed in
          </p>
          <p className="mt-1 truncate text-sm font-bold text-white">
            {currentUser?.name || currentUser?.username || "Admin"}
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15"
        >
          <Icon name="logout" className="h-5 w-5" />
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
};

export default function BrandAppShell({ brandId, children }) {
  const theme = getBrandTheme(brandId);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className="min-h-screen overflow-x-hidden lg:grid lg:grid-cols-[280px_minmax(0,1fr)]"
      style={{ backgroundColor: theme.background, color: theme.text }}
    >
      <aside
        className="sticky top-0 hidden h-screen overflow-y-auto px-4 py-5 lg:block"
        style={{ backgroundColor: theme.sidebarBg }}
      >
        <BrandSidebar brandId={brandId} />
      </aside>

      <div className="min-w-0">
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

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

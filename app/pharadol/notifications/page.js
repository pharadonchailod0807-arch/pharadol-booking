"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export default function NotificationsPage() {
  const router = useRouter();
  const CUSTOMERS_KEY = "pharadol_customers";
  const ARCHIVES_KEY = "pharadol_archives";

  const [customers, setCustomers] = useState([]);
  const [archives, setArchives] = useState([]);
  const [filterType, setFilterType] = useState("ทั้งหมด");
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const accountIsActive = currentUser?.active !== false;
        const brandIsCorrect = activeBrand === "pharadol";
        const lastActivity = Number(
          sessionStorage.getItem("lastActivity") || Date.now()
        );
        const sessionExpired = Date.now() - lastActivity > SESSION_TIMEOUT_MS;

        if (
          !loggedIn ||
          !currentUser ||
          !accountIsActive ||
          !brandIsCorrect ||
          sessionExpired
        ) {
          sessionStorage.clear();
          window.location.replace("/login");
          return false;
        }

        sessionStorage.setItem("lastActivity", String(Date.now()));
        setIsAuthorized(true);
        return true;
      } catch (error) {
        console.error("Cannot verify Pharadol notifications access", error);
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

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );

    return () => {
      window.clearInterval(sessionCheck);
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    const loadData = () => {
      try {
        const savedCustomers = JSON.parse(
          localStorage.getItem(CUSTOMERS_KEY) || "[]"
        );
        const savedArchives = JSON.parse(
          localStorage.getItem(ARCHIVES_KEY) || "[]"
        );

        setCustomers(Array.isArray(savedCustomers) ? savedCustomers : []);
        setArchives(Array.isArray(savedArchives) ? savedArchives : []);
      } catch (error) {
        console.error("Cannot load notification data", error);
        setCustomers([]);
        setArchives([]);
      }
    };

    const handleStorage = (event) => {
      if (event.key === CUSTOMERS_KEY || event.key === ARCHIVES_KEY) {
        loadData();
      }
    };

    loadData();
    window.addEventListener("focus", loadData);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("focus", loadData);
      window.removeEventListener("storage", handleStorage);
    };
  }, [isAuthorized]);

  const notifications = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeNotifications = customers.flatMap((customer, index) => {
      const items = [];
      const bookingNumber = customer.bookingNumber || `booking-${index}`;
      const customerName = customer.customerName || "ไม่ระบุชื่อลูกค้า";
      const finalPrice = Number(customer.finalPrice || 0);
      const paymentAmount = Number(customer.paymentAmount || 0);
      const outstanding = Math.max(finalPrice - paymentAmount, 0);

      if (customer.eventDate) {
        const eventDate = new Date(customer.eventDate);
        eventDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil(
          (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays >= 0 && diffDays <= 7) {
          items.push({
            id: `${bookingNumber}-event`,
            type: "งานใกล้ถึง",
            priority: diffDays <= 2 ? "ด่วน" : "ปกติ",
            title:
              diffDays === 0
                ? `วันนี้มีงานของ ${customerName}`
                : `งานของ ${customerName} เหลืออีก ${diffDays} วัน`,
            detail: `${customer.service || "ไม่ระบุประเภทงาน"} • ${customer.location || "ไม่ระบุสถานที่"}`,
            customer,
            sortDate: eventDate.getTime(),
          });
        }
      }

      if (outstanding > 0) {
        items.push({
          id: `${bookingNumber}-payment`,
          type: "ค้างชำระ",
          priority: "ปกติ",
          title: `${customerName} มียอดค้างชำระ`,
          detail: `คงเหลือ ฿${outstanding.toLocaleString("th-TH")}`,
          customer,
          sortDate: Number.MAX_SAFE_INTEGER - index,
        });
      }

      if (!customer.jobStatus || customer.jobStatus === "รอยืนยัน") {
        items.push({
          id: `${bookingNumber}-confirm`,
          type: "รอยืนยัน",
          priority: "ปกติ",
          title: `ใบจองของ ${customerName} ยังรอยืนยัน`,
          detail: `เลขที่จอง ${customer.bookingNumber || "-"}`,
          customer,
          sortDate: Number.MAX_SAFE_INTEGER - index - 1000,
        });
      }

      return items;
    });

    const archiveNotifications = archives.slice(0, 5).map((customer, index) => ({
      id: `${customer.bookingNumber || index}-archive`,
      type: "เก็บเข้าคลัง",
      priority: "ปกติ",
      title: `เก็บใบจองของ ${customer.customerName || "ไม่ระบุชื่อลูกค้า"} แล้ว`,
      detail: `เลขที่จอง ${customer.bookingNumber || "-"}`,
      customer,
      sortDate: Number.MAX_SAFE_INTEGER - index - 2000,
    }));

    return [...activeNotifications, ...archiveNotifications].sort(
      (a, b) => a.sortDate - b.sortDate
    );
  }, [customers, archives]);

  const filteredNotifications = useMemo(() => {
    if (filterType === "ทั้งหมด") return notifications;
    return notifications.filter((item) => item.type === filterType);
  }, [notifications, filterType]);

  const openBooking = (customer) => {
    localStorage.setItem(
      "pharadol_selectedBooking",
      JSON.stringify(customer)
    );
    localStorage.setItem(
      "pharadol_currentBooking",
      JSON.stringify(customer)
    );
    router.push("/pharadol?view=customer", { scroll: false });
  };

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  const urgentCount = notifications.filter(
    (item) => item.priority === "ด่วน"
  ).length;
  const paymentCount = notifications.filter(
    (item) => item.type === "ค้างชำระ"
  ).length;

  return (
    <main className="min-h-screen bg-zinc-100 p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">แจ้งเตือน</h1>
            <p className="mt-1 text-zinc-500">
              ติดตามงานใกล้ถึง ยอดค้างชำระ และใบจองที่รอยืนยัน
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/pharadol/dashboard")}
            className="rounded-xl bg-black px-5 py-3 font-semibold text-white hover:bg-zinc-800"
          >
            กลับสู่หน้าหลัก
          </button>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">แจ้งเตือนทั้งหมด</p>
            <p className="mt-2 text-3xl font-bold text-zinc-900">
              {notifications.length}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-red-600">งานด่วน</p>
            <p className="mt-2 text-3xl font-bold text-red-600">
              {urgentCount}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-orange-600">ค้างชำระ</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">
              {paymentCount}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-semibold text-zinc-600">
            ประเภทแจ้งเตือน
          </label>
          <select
            value={filterType}
            onChange={(event) => setFilterType(event.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 md:max-w-xs"
          >
            <option value="ทั้งหมด">ทั้งหมด</option>
            <option value="งานใกล้ถึง">งานใกล้ถึง</option>
            <option value="ค้างชำระ">ค้างชำระ</option>
            <option value="รอยืนยัน">รอยืนยัน</option>
            <option value="เก็บเข้าคลัง">เก็บเข้าคลัง</option>
          </select>
        </div>

        <div className="space-y-3">
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                      {item.type}
                    </span>
                    {item.priority === "ด่วน" && (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                        ด่วน
                      </span>
                    )}
                  </div>
                  <h2 className="font-bold text-zinc-900">{item.title}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{item.detail}</p>
                </div>

                <button
                  type="button"
                  onClick={() => openBooking(item.customer)}
                  className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                >
                  ดูใบจอง
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-white p-10 text-center text-zinc-500 shadow-sm">
              ไม่มีรายการแจ้งเตือน
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
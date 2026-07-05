"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const NOTIFICATIONS_KEY = "pharadol_notifications";
const ARCHIVE_KEY = "pharadol_notifications_archive";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export default function ReportsPage() {
  const router = useRouter();

  const [notifications, setNotifications] = useState([]);
  const [archive, setArchive] = useState([]);
  const [filterStatus, setFilterStatus] = useState("ทั้งหมด");
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

    const loadNotifications = () => {
      try {
        const savedNotifications = JSON.parse(
          localStorage.getItem(NOTIFICATIONS_KEY) || "[]"
        );
        const normalizedNotifications = Array.isArray(savedNotifications)
          ? savedNotifications
          : [];
        localStorage.setItem(
          NOTIFICATIONS_KEY,
          JSON.stringify(normalizedNotifications)
        );
        setNotifications(normalizedNotifications);
      } catch (error) {
        console.error("Cannot load notifications data", error);
        setNotifications([]);
      }
    };

    const loadArchive = () => {
      try {
        const savedArchive = JSON.parse(
          localStorage.getItem(ARCHIVE_KEY) || "[]"
        );
        const normalizedArchive = Array.isArray(savedArchive)
          ? savedArchive
          : [];
        localStorage.setItem(ARCHIVE_KEY, JSON.stringify(normalizedArchive));
        setArchive(normalizedArchive);
      } catch (error) {
        console.error("Cannot load archive data", error);
        setArchive([]);
      }
    };

    const handleNotificationStorage = (event) => {
      if (event.key === NOTIFICATIONS_KEY) {
        loadNotifications();
      }
      if (event.key === ARCHIVE_KEY) {
        loadArchive();
      }
    };

    loadNotifications();
    loadArchive();

    window.addEventListener("focus", loadNotifications);
    window.addEventListener("storage", handleNotificationStorage);

    return () => {
      window.removeEventListener("focus", loadNotifications);
      window.removeEventListener("storage", handleNotificationStorage);
    };
  }, [isAuthorized]);

  const moveToTrash = (notification) => {
    const newNotifications = notifications.filter(
      (n) => n.id !== notification.id
    );
    const newArchive = [notification, ...archive];
    setNotifications(newNotifications);
    setArchive(newArchive);
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(newNotifications));
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(newArchive));
  };

  const filteredNotifications = useMemo(() => {
    if (filterStatus === "ทั้งหมด") {
      return notifications;
    }
    return notifications.filter((n) => n.status === filterStatus);
  }, [notifications, filterStatus]);

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold md:text-4xl">แจ้งเตือน</h1>
            <p className="mt-1 text-zinc-500">รายการแจ้งเตือนล่าสุด</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              ← ย้อนกลับ
            </button>

            <button
              type="button"
              onClick={() => router.push("/pharadol/dashboard")}
              className="min-h-12 rounded-xl bg-black px-5 py-3 font-semibold text-white"
            >
              เมนูหลัก
            </button>
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-semibold text-zinc-600">
            กรองสถานะ
          </label>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full rounded-xl border bg-white p-3"
          >
            <option value="ทั้งหมด">ทั้งหมด</option>
            <option value="ใหม่">ใหม่</option>
            <option value="อ่านแล้ว">อ่านแล้ว</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[auto_1fr_auto] gap-4 bg-zinc-900 px-5 py-4 font-semibold text-white">
              <div>วันที่</div>
              <div>ข้อความ</div>
              <div className="text-center">จัดการ</div>
            </div>

            {filteredNotifications.length > 0 ? (
              filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-zinc-200 px-5 py-4"
                >
                  <div className="font-semibold text-zinc-700">
                    {new Date(notification.date).toLocaleDateString("th-TH")}
                  </div>
                  <div>
                    <p className="font-semibold">{notification.message}</p>
                    <p className="text-sm text-zinc-500">
                      สถานะ: {notification.status}
                    </p>
                  </div>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => moveToTrash(notification)}
                      className="min-h-10 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-zinc-500">
                ไม่พบแจ้งเตือนตามตัวกรอง
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

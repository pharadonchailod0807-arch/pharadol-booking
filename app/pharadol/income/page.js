"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export default function IncomePage() {
  const router = useRouter();
  const [totalIncome, setTotalIncome] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [averageIncome, setAverageIncome] = useState(0);
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
        console.error("Cannot verify Pharadol income access", error);
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

    const loadIncomeData = () => {
      try {
        const savedArchives = JSON.parse(
          localStorage.getItem("pharadol_archives") || "[]"
        );

        const archives = Array.isArray(savedArchives)
          ? savedArchives
          : [];

        localStorage.setItem(
          "pharadol_archives",
          JSON.stringify(archives)
        );

        const total = archives.reduce(
          (sum, item) =>
            sum + Number(item.finalPrice || item.price || 0),
          0
        );

        setTotalIncome(total);
        setJobCount(archives.length);
        setAverageIncome(
          archives.length > 0
            ? Math.round(total / archives.length)
            : 0
        );
      } catch (error) {
        console.error("Cannot load income data", error);
        setTotalIncome(0);
        setJobCount(0);
        setAverageIncome(0);
      }
    };

    loadIncomeData();

    window.addEventListener("focus", loadIncomeData);
    return () => {
      window.removeEventListener("focus", loadIncomeData);
    };
  }, [isAuthorized]);

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">💰 รายได้สตูดิโอ</h1>
            <p className="mt-2 text-zinc-500">
              สรุปรายได้จากงานที่ปิดแล้ว
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/pharadol/dashboard")}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
          >
            กลับเมนูหลัก
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
            <p className="text-zinc-500">รายได้ทั้งหมด</p>
            <h2 className="mt-3 text-5xl font-bold text-green-600">
              ฿ {totalIncome.toLocaleString()}
            </h2>
          </div>

          <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
            <p className="text-zinc-500">งานที่ปิดแล้ว</p>
            <h2 className="mt-3 text-5xl font-bold">{jobCount}</h2>
          </div>

          <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
            <p className="text-zinc-500">ค่าเฉลี่ยต่องาน</p>
            <h2 className="mt-3 text-5xl font-bold text-blue-600">
              ฿ {averageIncome.toLocaleString()}
            </h2>
          </div>
        </div>
      </div>
    </main>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function IncomePage() {
  const router = useRouter();
  const [totalIncome, setTotalIncome] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [averageIncome, setAverageIncome] = useState(0);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    try {
      const loggedIn = sessionStorage.getItem("loggedIn") === "true";
      const currentUser = JSON.parse(
        sessionStorage.getItem("currentUser") || "null"
      );
      const activeBrand = sessionStorage.getItem("activeBrand");
      const users = JSON.parse(
        localStorage.getItem("central_admin_users") || "[]"
      );
      const latestAccount = Array.isArray(users)
        ? users.find((user) => user.id === currentUser?.id)
        : null;
      const isAdmin = currentUser?.role === "ADMIN";
      const hasBrandAccess = currentUser?.brands?.includes("adisorn");
      const accountIsActive = isAdmin || latestAccount?.active === true;
      const brandIsCorrect = isAdmin
        ? activeBrand === "adisorn"
        : activeBrand === "adisorn" && hasBrandAccess;

      if (!loggedIn || !currentUser || !accountIsActive || !brandIsCorrect) {
        sessionStorage.clear();
        window.location.replace("/login");
        return;
      }

      window.setTimeout(() => {
        setIsAuthorized(true);
      }, 0);
    } catch (error) {
      console.error("Cannot verify Adisorn access", error);
      sessionStorage.clear();
      window.location.replace("/login");
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    try {
      const savedArchives = JSON.parse(
        localStorage.getItem("adisorn_archives") || "[]"
      );

      const archives = Array.isArray(savedArchives)
        ? savedArchives
        : [];

      localStorage.setItem(
        "adisorn_archives",
        JSON.stringify(archives)
      );

      const total = archives.reduce(
        (sum, item) =>
          sum + Number(item.finalPrice || item.price || 0),
        0
      );

      window.setTimeout(() => {
        setTotalIncome(total);
        setJobCount(archives.length);
        setAverageIncome(
          archives.length > 0
            ? Math.round(total / archives.length)
            : 0
        );
      }, 0);
    } catch (error) {
      console.error("Cannot load income data", error);
      window.setTimeout(() => {
        setTotalIncome(0);
        setJobCount(0);
        setAverageIncome(0);
      }, 0);
    }
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
            onClick={() => router.push("/adisorn/dashboard")}
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

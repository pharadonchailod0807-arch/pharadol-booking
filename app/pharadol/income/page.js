"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RevenueTradingChart from "@/app/components/RevenueTradingChart";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const BRAND_ID = "pharadol";
const ARCHIVES_KEY = "pharadol_archives";
const MONTH_LABELS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
const COMPLETED_JOB_STATUSES = new Set([
  "completed",
  "finished",
  "closed",
  "done",
  "เสร็จสิ้น",
  "ส่งมอบแล้ว",
  "ปิดงานแล้ว",
  "งานเสร็จแล้ว",
  "ส่งงานแล้ว",
  "ปิดงาน",
]);
const CHART_MODES = {
  day: "รายวัน",
  month: "รายเดือน",
  year: "รายปี",
};

const isClosedJob = (item) => {
  const status = String(item?.status || item?.jobStatus || item?.bookingStatus || "")
    .trim()
    .toLowerCase();
  return COMPLETED_JOB_STATUSES.has(status);
};

const getJobDate = (item) => {
  const value = item?.paymentDate || item?.eventDate || item?.bookingDate || item?.createdAt;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const getJobAmount = (item) => {
  const rawAmount =
    item?.finalPrice ??
    item?.netTotal ??
    item?.grandTotal ??
    item?.totalPrice ??
    item?.total ??
    item?.serviceTotal ??
    item?.price ??
    item?.paymentAmount ??
    0;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : Number(String(rawAmount).replace(/[^\d.-]/g, ""));

  return Number.isFinite(amount) ? amount : 0;
};

const normalizeArchivedBookingRow = (row) => {
  const bookingData = row?.booking_data || {};

  return {
    ...bookingData,
    supabaseId: row.id,
    brandId: bookingData.brandId || "",
    bookingNumber: bookingData.bookingNumber || row.booking_number || "",
    customerName: bookingData.customerName || row.customer_name || "",
    service: bookingData.service || row.service || "",
    eventDate: bookingData.eventDate || row.event_date || "",
    jobStatus: row.job_status || bookingData.jobStatus || "รอยืนยัน",
    status: row.job_status || bookingData.status || bookingData.jobStatus || "รอยืนยัน",
  };
};

export default function IncomePage() {
  const router = useRouter();
  const currentDate = new Date();
  const [totalIncome, setTotalIncome] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [averageIncome, setAverageIncome] = useState(0);
  const [closedJobs, setClosedJobs] = useState([]);
  const [chartMode, setChartMode] = useState("month");
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [isAuthorized, setIsAuthorized] = useState(false);

  const yearOptions = useMemo(() => {
    const years = new Set([currentDate.getFullYear()]);

    closedJobs.forEach((item) => {
      const date = getJobDate(item);
      if (date) years.add(date.getFullYear());
    });

    return Array.from(years).sort((a, b) => b - a);
  }, [closedJobs, currentDate]);

  const chartData = useMemo(() => {
    if (chartMode === "day") {
      const dayCount = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const totals = Array(dayCount).fill(0);

      closedJobs.forEach((item) => {
        const date = getJobDate(item);
        if (
          date &&
          date.getFullYear() === selectedYear &&
          date.getMonth() === selectedMonth
        ) {
          totals[date.getDate() - 1] += getJobAmount(item);
        }
      });

      return totals.map((total, index) => ({
        label: String(index + 1),
        total,
      }));
    }

    if (chartMode === "year") {
      const years = yearOptions.length > 0 ? [...yearOptions].reverse() : [selectedYear];

      return years.map((year) => ({
        label: String(year + 543),
        total: closedJobs.reduce((sum, item) => {
          const date = getJobDate(item);
          if (!date || date.getFullYear() !== year) return sum;
          return sum + getJobAmount(item);
        }, 0),
      }));
    }

    const totals = Array(12).fill(0);

    closedJobs.forEach((item) => {
      const date = getJobDate(item);
      if (date && date.getFullYear() === selectedYear) {
        totals[date.getMonth()] += getJobAmount(item);
      }
    });

    return MONTH_LABELS.map((month, index) => ({
      label: month,
      total: totals[index],
    }));
  }, [chartMode, closedJobs, selectedMonth, selectedYear, yearOptions]);

  const chartTotal = chartData.reduce((sum, item) => sum + item.total, 0);

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

    const loadIncomeData = async () => {
      try {
        const savedArchives = JSON.parse(
          localStorage.getItem(ARCHIVES_KEY) || "[]"
        );

        const localArchives = Array.isArray(savedArchives)
          ? savedArchives
          : [];
        let archives = localArchives;

        try {
          const { data, error } = await supabase
            .from("bookings")
            .select("*")
            .eq("archived", true)
            .eq("deleted", false)
            .order("booking_number", { ascending: false });

          if (error) throw error;

          const remoteArchives = (Array.isArray(data) ? data : [])
            .map(normalizeArchivedBookingRow)
            .filter((item) => item.brandId === BRAND_ID);

          if (remoteArchives.length > 0) {
            archives = remoteArchives;
            localStorage.setItem(ARCHIVES_KEY, JSON.stringify(remoteArchives));
          }
        } catch (error) {
          console.error("Cannot load income archives from Supabase", error);
        }

        const completedArchivedJobs = archives.filter(
          (item) => item?.archiveType !== "payment-receipt" && isClosedJob(item)
        );

        localStorage.setItem(ARCHIVES_KEY, JSON.stringify(archives));

        const total = completedArchivedJobs.reduce((sum, item) => {
          return sum + getJobAmount(item);
        }, 0);

        setClosedJobs(completedArchivedJobs);
        setTotalIncome(total);
        setJobCount(completedArchivedJobs.length);
        setAverageIncome(
          completedArchivedJobs.length > 0
            ? Math.round(total / completedArchivedJobs.length)
            : 0
        );
      } catch (error) {
        console.error("Cannot load income data", error);
        setClosedJobs([]);
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
    <main className="min-h-screen bg-zinc-100 p-4 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1720px]">
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

        <section className="mt-8 rounded-3xl bg-white p-5 shadow-xl md:p-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">
                รายได้ตามช่วงเวลา
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                ใช้ข้อมูลจากคลังข้อมูล เฉพาะสถานะงานเสร็จแล้ว
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-zinc-100 p-1">
                {Object.entries(CHART_MODES).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChartMode(mode)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      chartMode === mode
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:bg-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {chartMode === "day" && (
                <select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(Number(event.target.value))}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none"
                >
                  {MONTH_LABELS.map((month, index) => (
                    <option key={month} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
              )}
              {chartMode !== "year" && (
                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year + 543}
                    </option>
                  ))}
                </select>
              )}
              <span className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-600">
                ฿ {chartTotal.toLocaleString()}
              </span>
            </div>
          </div>

          <RevenueTradingChart data={chartData} total={chartTotal} />
        </section>
      </div>
    </main>
  );
}

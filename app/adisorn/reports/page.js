"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";

const BRAND_ID = "adisorn";
const CUSTOMERS_KEY = "adisorn_customers";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export default function ReportsPage() {
  const router = useRouter();
  const brandChrome = getBrandChromeStyles(BRAND_ID);

  const [customers, setCustomers] = useState([]);
  const [filterStatus, setFilterStatus] = useState("ทั้งหมด");
  const [filterJobStatus, setFilterJobStatus] = useState("ทั้งหมด");
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const verifyAccess = () => {
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
        const accountIsActive = latestAccount?.active === true;
        const brandIsCorrect =
          activeBrand === "adisorn" && (isAdmin || hasBrandAccess);
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
        console.error("Cannot verify Adisorn access", error);
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
      if (event.key === "central_admin_users") {
        verifyAccess();
      }
    };

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearInterval(sessionCheck);
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    try {
      const savedCustomers = JSON.parse(
        localStorage.getItem(CUSTOMERS_KEY) || "[]"
      );

      const normalizedCustomers = Array.isArray(savedCustomers)
        ? savedCustomers
        : [];

      localStorage.setItem(
        CUSTOMERS_KEY,
        JSON.stringify(normalizedCustomers)
      );
      window.setTimeout(() => {
        setCustomers(normalizedCustomers);
      }, 0);
    } catch (error) {
      console.error("Cannot load report data", error);
      window.setTimeout(() => {
        setCustomers([]);
      }, 0);
    }
  }, [isAuthorized]);

  const getPaymentCategory = (customer) => {
    const finalPrice = Number(customer.finalPrice || 0);
    const paymentAmount = Number(customer.paymentAmount || 0);
    const paymentProgress = customer.paymentProgress || "ยังไม่ชำระ";

    if (
      paymentProgress === "ชำระครบแล้ว" ||
      (finalPrice > 0 && paymentAmount >= finalPrice)
    ) {
      return "ชำระครบแล้ว";
    }

    if (paymentAmount > 0) {
      return "มัดจำแล้ว";
    }

    return "ยังไม่มัดจำ";
  };

  const urgentCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return customers.filter((customer) => {
      if (!customer.eventDate) return false;

      const eventDate = new Date(customer.eventDate);
      eventDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor(
        (eventDate - today) / (1000 * 60 * 60 * 24)
      );

      return diffDays >= 0 && diffDays <= 3;
    }).length;
  }, [customers]);

  const unpaidCount = customers.filter(
    (customer) => getPaymentCategory(customer) === "ยังไม่มัดจำ"
  ).length;

  const depositCount = customers.filter(
    (customer) => getPaymentCategory(customer) === "มัดจำแล้ว"
  ).length;

  const paidCount = customers.filter(
    (customer) => getPaymentCategory(customer) === "ชำระครบแล้ว"
  ).length;

  const pendingJobs = customers.filter(
    (customer) => customer.jobStatus === "รอยืนยัน"
  ).length;

  const confirmedJobs = customers.filter(
    (customer) => customer.jobStatus === "ยืนยันการจอง"
  ).length;

  const preparingJobs = customers.filter(
    (customer) => customer.jobStatus === "เตรียมงาน"
  ).length;

  const shootingDoneJobs = customers.filter(
    (customer) => customer.jobStatus === "ถ่ายงานแล้ว"
  ).length;

  const editingJobs = customers.filter(
    (customer) => customer.jobStatus === "กำลังคัด/ตัดต่อ"
  ).length;

  const deliveredJobs = customers.filter(
    (customer) => customer.jobStatus === "ส่งงานแล้ว"
  ).length;

  const closedJobs = customers.filter(
    (customer) => customer.jobStatus === "ปิดงาน"
  ).length;

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const matchesPayment =
        filterStatus === "ทั้งหมด" ||
        getPaymentCategory(customer) === filterStatus;

      const matchesJob =
        filterJobStatus === "ทั้งหมด" ||
        customer.jobStatus === filterJobStatus;

      return matchesPayment && matchesJob;
    });
  }, [customers, filterStatus, filterJobStatus]);

  const totalRevenue = customers.reduce(
    (sum, customer) => sum + Number(customer.finalPrice || 0),
    0
  );

  const totalPaid = customers.reduce(
    (sum, customer) => sum + Number(customer.paymentAmount || 0),
    0
  );

  const totalOutstanding = Math.max(totalRevenue - totalPaid, 0);

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-4 md:p-6 xl:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">รายงานและสถิติ</h1>
            <p className="mt-1 text-zinc-500">
              ภาพรวมลูกค้า การชำระเงิน และสถานะงาน
            </p>
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
              onClick={() => router.push("/adisorn/dashboard")}
              className="min-h-12 rounded-xl px-5 py-3 font-semibold text-white transition"
              style={brandChrome.primaryButton}
            >
              เมนูหลัก
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-2xl bg-white p-4 shadow-sm md:p-5">
            <p className="text-zinc-500">ลูกค้าทั้งหมด</p>
            <p className="mt-2 text-2xl font-bold md:text-3xl">{customers.length}</p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm md:p-5">
            <p className="text-orange-600">งานด่วนภายใน 3 วัน</p>
            <p className="mt-2 text-2xl font-bold text-orange-600 md:text-3xl">
              {urgentCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm md:p-5">
            <p className="text-red-600">ยังไม่มัดจำ</p>
            <p className="mt-2 text-2xl font-bold text-red-600 md:text-3xl">
              {unpaidCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm md:p-5">
            <p className="text-blue-600">กำลังคัด/ตัดต่อ</p>
            <p className="mt-2 text-2xl font-bold text-blue-600 md:text-3xl">
              {editingJobs}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm md:p-5">
            <p className="text-zinc-500">ยอดงานรวม</p>
            <p className="mt-2 text-xl font-bold md:text-2xl">
              ฿ {totalRevenue.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm md:p-5">
            <p className="text-red-600">ยอดค้างชำระ</p>
            <p className="mt-2 text-xl font-bold text-red-600 md:text-2xl">
              ฿ {totalOutstanding.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-600">
              💰 สถานะการชำระ
            </label>

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="w-full rounded-xl border bg-white p-3"
            >
              <option value="ทั้งหมด">ทั้งหมด</option>
              <option value="ยังไม่มัดจำ">
                ยังไม่มัดจำ ({unpaidCount})
              </option>
              <option value="มัดจำแล้ว">
                มัดจำแล้ว ({depositCount})
              </option>
              <option value="ชำระครบแล้ว">
                ชำระครบแล้ว ({paidCount})
              </option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-600">
              🎬 สถานะงาน
            </label>

            <select
              value={filterJobStatus}
              onChange={(event) => setFilterJobStatus(event.target.value)}
              className="w-full rounded-xl border bg-white p-3"
            >
              <option value="ทั้งหมด">งานทั้งหมด</option>
              <option value="รอยืนยัน">รอยืนยัน ({pendingJobs})</option>
              <option value="ยืนยันการจอง">
                ยืนยันการจอง ({confirmedJobs})
              </option>
              <option value="เตรียมงาน">เตรียมงาน ({preparingJobs})</option>
              <option value="ถ่ายงานแล้ว">
                ถ่ายงานแล้ว ({shootingDoneJobs})
              </option>
              <option value="กำลังคัด/ตัดต่อ">
                กำลังคัด/ตัดต่อ ({editingJobs})
              </option>
              <option value="ส่งงานแล้ว">
                ส่งงานแล้ว ({deliveredJobs})
              </option>
              <option value="ปิดงาน">ปิดงาน ({closedJobs})</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:hidden">
          {filteredCustomers.length > 0 ? (
            filteredCustomers.map((customer, index) => (
              <article
                key={customer.bookingNumber || index}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-500">
                      {customer.bookingNumber || "-"}
                    </p>
                    <h2 className="mt-1 break-words text-lg font-bold text-zinc-950">
                      {customer.customerName || "-"}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {customer.phone || "-"}
                    </p>
                  </div>
                  <p className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-sm font-bold text-zinc-700">
                    ฿ {Number(customer.finalPrice || 0).toLocaleString()}
                  </p>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-zinc-600">
                  <p>
                    <span className="font-semibold text-zinc-500">งาน:</span>{" "}
                    {customer.service || "-"}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-500">ชำระ:</span>{" "}
                    {getPaymentCategory(customer)}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-500">สถานะงาน:</span>{" "}
                    {customer.jobStatus || "-"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(
                      "adisorn_selectedBooking",
                      JSON.stringify(customer)
                    );
                    localStorage.setItem(
                      "adisorn_currentBooking",
                      JSON.stringify(customer)
                    );
                    router.push("/adisorn?view=customer", { scroll: false });
                  }}
                  className="mt-4 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  ดูใบจอง
                </button>
              </article>
            ))
          ) : (
            <div className="rounded-2xl bg-white p-8 text-center text-zinc-500 shadow-sm">
              ไม่พบข้อมูลตามตัวกรอง
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
          <div className="min-w-[1040px]">
          <div
            className="grid grid-cols-[1fr_1.2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-4 font-semibold text-white"
            style={brandChrome.tableHeader}
          >
            <div>เลขที่จอง</div>
            <div>ชื่อลูกค้า</div>
            <div>ประเภทงาน</div>
            <div className="text-center">จัดการ</div>
            <div>สถานะชำระ</div>
            <div>สถานะงาน</div>
            <div className="text-right">ยอดสุทธิ</div>
          </div>

          {filteredCustomers.length > 0 ? (
            filteredCustomers.map((customer, index) => (
              <div
                key={customer.bookingNumber || index}
                className="grid grid-cols-[1fr_1.2fr_1fr_1fr_1fr_1fr_auto] items-center gap-4 border-t border-zinc-200 px-5 py-4"
              >
                <div className="font-semibold">
                  {customer.bookingNumber || "-"}
                </div>
                <div>
                  <p className="font-semibold">
                    {customer.customerName || "-"}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {customer.phone || "-"}
                  </p>
                </div>
                <div>{customer.service || "-"}</div>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem(
                        "adisorn_selectedBooking",
                        JSON.stringify(customer)
                      );
                      localStorage.setItem(
                        "adisorn_currentBooking",
                        JSON.stringify(customer)
                      );
                      router.push("/adisorn?view=customer", { scroll: false });
                    }}
                    className="min-h-10 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                  >
                    ดูใบจอง
                  </button>
                </div>
                <div>{getPaymentCategory(customer)}</div>
                <div>{customer.jobStatus || "-"}</div>
                <div className="text-right font-semibold">
                  ฿ {Number(customer.finalPrice || 0).toLocaleString()}
                </div>
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-zinc-500">
              ไม่พบข้อมูลตามตัวกรอง
            </div>
          )}
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export default function CalendarPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const normalizedBrands = Array.isArray(currentUser?.brands)
          ? currentUser.brands.map((brand) =>
              brand === "pharadon" ? "pharadol" : brand
            )
          : [];
        const isAdmin = currentUser?.role === "ADMIN";
        const hasBrandAccess = normalizedBrands.includes("pharadol");
        const accountIsActive = currentUser?.active !== false;
        const brandIsCorrect =
          activeBrand === "pharadol" && (isAdmin || hasBrandAccess);
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
        console.error("Cannot verify Pharadol access", error);
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

    try {
      const savedCustomers = JSON.parse(
        localStorage.getItem("pharadol_customers") || "[]"
      );

      const safeCustomers = Array.isArray(savedCustomers)
        ? savedCustomers
        : [];

      localStorage.setItem(
        "pharadol_customers",
        JSON.stringify(safeCustomers)
      );
      window.setTimeout(() => {
        setCustomers(safeCustomers);
      }, 0);
    } catch (error) {
      console.error("Cannot load calendar data", error);
      window.setTimeout(() => {
        setCustomers([]);
      }, 0);
    }
  }, [isAuthorized]);

  const events = useMemo(() => {
    return customers
      .filter((customer) => customer.eventDate)
      .sort(
        (a, b) =>
          new Date(a.eventDate).getTime() -
          new Date(b.eventDate).getTime()
      );
  }, [customers]);

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

  return (
    <main className="min-h-screen bg-zinc-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">📅 ปฏิทินงาน</h1>
            <p className="mt-2 text-zinc-500">
              ตารางงานทั้งหมดเรียงตามวันที่
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

        <div className="space-y-4">
          {events.length > 0 ? (
            events.map((item, index) => (
              <div
                key={`${item.bookingNumber || "event"}-${index}`}
                className="rounded-2xl bg-white p-5 shadow"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p>
                      <strong>📅 วันงาน:</strong>{" "}
                      {new Date(item.eventDate).toLocaleDateString("th-TH", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>

                    <p>
                      <strong>👤 ลูกค้า:</strong>{" "}
                      {item.customerName || "-"}
                    </p>

                    <p>
                      <strong>🎬 ประเภทงาน:</strong>{" "}
                      {item.service || "-"}
                    </p>

                    <p>
                      <strong>📍 สถานที่:</strong>{" "}
                      {item.location || "-"}
                    </p>

                    <p>
                      <strong>📞 เบอร์โทร:</strong>{" "}
                      {item.phone || "-"}
                    </p>

                    <p>
                      <strong>🕒 เวลา:</strong>{" "}
                      {item.startTime || "-"} - {item.endTime || "-"}
                    </p>

                    <p>
                      <strong>📌 สถานะงาน:</strong>{" "}
                      {item.jobStatus || "รอยืนยัน"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openBooking(item)}
                    className="rounded-xl bg-zinc-900 px-4 py-2 font-semibold text-white hover:bg-zinc-700"
                  >
                    ดูใบจอง
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-white p-10 text-center text-zinc-500 shadow">
              ยังไม่มีคิวงาน
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

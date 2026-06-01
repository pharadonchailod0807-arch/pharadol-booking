"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [customerCount, setCustomerCount] = useState(0);
  const [archiveCount, setArchiveCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [todayJobs, setTodayJobs] = useState(0);
  const [upcomingJobs, setUpcomingJobs] = useState(0);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const loggedIn = localStorage.getItem("loggedIn");

    if (!loggedIn) {
      window.location.href = "/login";
      return;
    }

    const customers = JSON.parse(localStorage.getItem("customers")) || [];
    const archives = JSON.parse(localStorage.getItem("archives")) || [];
    const trash = JSON.parse(localStorage.getItem("trash")) || [];

    setCustomerCount(customers.length);
    setArchiveCount(archives.length);
    setTrashCount(trash.length);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let todayCount = 0;
    let upcomingCount = 0;
    const upcomingAlerts = [];

    customers.forEach((item) => {
      if (!item.eventDate) return;

      const eventDate = new Date(item.eventDate);
      eventDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor(
        (eventDate - today) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === 0) {
        todayCount++;
      }

      if (diffDays > 0 && diffDays <= 7) {
        upcomingCount++;

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
  }, []);

  const logout = () => {
    localStorage.removeItem("loggedIn");
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-zinc-100 p-10">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-bold">ระบบจัดการสตูดิโอ</h1>

        <button
          onClick={logout}
          className="bg-red-500 text-white px-5 py-3 rounded-xl"
        >
          ออกจากระบบ
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-10 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl p-6 text-center">
          <p className="text-zinc-500">ลูกค้าปัจจุบัน</p>
          <h2 className="text-4xl font-bold mt-2">
            {customerCount}
          </h2>
          <p className="text-zinc-500 mt-2">รายการ</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 text-center">
          <p className="text-zinc-500">งานที่ปิดแล้ว</p>
          <h2 className="text-4xl font-bold mt-2">
            {archiveCount}
          </h2>
          <p className="text-zinc-500 mt-2">รายการ</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 text-center">
          <p className="text-zinc-500">รายการในถังขยะ</p>
          <h2 className="text-4xl font-bold mt-2">
            {trashCount}
          </h2>
          <p className="text-zinc-500 mt-2">รายการ</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 text-center">
          <p className="text-zinc-500">งานวันนี้</p>
          <h2 className="text-4xl font-bold mt-2 text-green-600">
            {todayJobs}
          </h2>
          <p className="text-zinc-500 mt-2">งาน</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 text-center">
          <p className="text-zinc-500">งานใน 7 วัน</p>
          <h2 className="text-4xl font-bold mt-2 text-orange-500">
            {upcomingJobs}
          </h2>
          <p className="text-zinc-500 mt-2">งาน</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl p-6 mb-10 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">
          ⚠️ งานใกล้ถึงวัน
        </h2>

        {alerts.length === 0 ? (
          <p className="text-zinc-500">
            ไม่มีงานใน 7 วันข้างหน้า
          </p>
        ) : (
          <div className="space-y-3">
            {alerts.map((job, index) => (
              <div
                key={index}
                className="border rounded-xl p-3 flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold">
                    {job.customerName}
                  </p>
                  <p className="text-zinc-500 text-sm">
                    {job.service}
                  </p>
                </div>

                <div className="font-bold text-orange-500">
                  อีก {job.diffDays} วัน
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
        <div onClick={() => (window.location.href = "/")} className="cursor-pointer bg-white rounded-3xl shadow-xl p-10 text-center hover:scale-105 transition">
          <div className="text-7xl mb-4">📄</div>
          <h2 className="text-2xl font-bold">ระบบสร้างใบจอง</h2>
          <p className="text-zinc-500 mt-3">สร้างใบจองใหม่</p>
        </div>

        <div onClick={() => (window.location.href = "/customers")} className="cursor-pointer bg-white rounded-3xl shadow-xl p-10 text-center hover:scale-105 transition">
          <div className="text-7xl mb-4">👥</div>
          <h2 className="text-2xl font-bold">ข้อมูลลูกค้า</h2>
          <p className="text-zinc-500 mt-3">รายชื่อลูกค้าทั้งหมด</p>
          <p className="font-bold text-lg mt-2">{customerCount} รายการ</p>
        </div>

        <div onClick={() => (window.location.href = "/archives")} className="cursor-pointer bg-white rounded-3xl shadow-xl p-10 text-center hover:scale-105 transition">
          <div className="text-7xl mb-4">📦</div>
          <h2 className="text-2xl font-bold">คลังข้อมูล</h2>
          <p className="text-zinc-500 mt-3">ข้อมูลลูกค้าที่จัดเก็บแล้ว</p>
          <p className="font-bold text-lg mt-2">{archiveCount} รายการ</p>
        </div>

        <div onClick={() => (window.location.href = "/calendar")} className="cursor-pointer bg-white rounded-3xl shadow-xl p-10 text-center hover:scale-105 transition">
          <div className="text-7xl mb-4">📅</div>
          <h2 className="text-2xl font-bold">ปฏิทินงาน</h2>
          <p className="text-zinc-500 mt-3">ตารางงานทั้งหมด</p>
        </div>

        <div onClick={() => (window.location.href = "/trash")} className="cursor-pointer bg-white rounded-3xl shadow-xl p-10 text-center hover:scale-105 transition">
          <div className="text-7xl mb-4">🗑️</div>
          <h2 className="text-2xl font-bold">ถังขยะ</h2>
          <p className="text-zinc-500 mt-3">รายการที่ถูกลบ</p>
          <p className="font-bold text-lg mt-2">{trashCount} รายการ</p>
        </div>

        <div onClick={() => (window.location.href = "/income")} className="cursor-pointer bg-white rounded-3xl shadow-xl p-10 text-center hover:scale-105 transition">
          <div className="text-7xl mb-4">💰</div>
          <h2 className="text-2xl font-bold">รายได้</h2>
          <p className="text-zinc-500 mt-3">รายได้ทั้งหมดของสตูดิโอ</p>
        </div>

        <div onClick={() => (window.location.href = "/settings")} className="cursor-pointer bg-white rounded-3xl shadow-xl p-10 text-center hover:scale-105 transition">
          <div className="text-7xl mb-4">⚙️</div>
          <h2 className="text-2xl font-bold">ตั้งค่าระบบ</h2>
          <p className="text-zinc-500 mt-3">จัดการข้อมูลสตูดิโอ</p>
        </div>
      </div>
    </div>
  );
}
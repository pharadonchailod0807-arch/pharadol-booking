

"use client";

import { useEffect, useState } from "react";

export default function NotificationsPage() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const customers = JSON.parse(localStorage.getItem("customers")) || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = [];

    customers.forEach((item) => {
      if (!item.eventDate) return;

      const eventDate = new Date(item.eventDate);
      eventDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor(
        (eventDate - today) / (1000 * 60 * 60 * 24)
      );

      if (diffDays >= 0 && diffDays <= 7) {
        items.push({
          title: item.customerName,
          detail: item.service,
          days: diffDays,
        });
      }
    });

    setAlerts(items.sort((a, b) => a.days - b.days));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-100 p-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">🔔 แจ้งเตือน</h1>

        <button
          onClick={() => (window.location.href = "/dashboard")}
          className="bg-blue-500 text-white px-5 py-3 rounded-xl"
        >
          กลับเมนูหลัก
        </button>
      </div>

      <div className="space-y-4">
        {alerts.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow">
            ไม่มีงานที่ต้องแจ้งเตือน
          </div>
        ) : (
          alerts.map((item, index) => (
            <div key={index} className="bg-white rounded-2xl p-6 shadow">
              <h2 className="font-bold text-xl">{item.title}</h2>
              <p className="text-zinc-500">{item.detail}</p>
              <p className="mt-2 text-orange-500 font-bold">
                อีก {item.days} วัน
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
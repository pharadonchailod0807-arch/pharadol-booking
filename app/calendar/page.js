

"use client";

import { useEffect, useState } from "react";

export default function CalendarPage() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const customers =
      JSON.parse(localStorage.getItem("customers")) || [];

    const sorted = [...customers].sort(
      (a, b) =>
        new Date(a.eventDate) - new Date(b.eventDate)
    );

    setEvents(sorted);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-100 p-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">
          📅 ปฏิทินงาน
        </h1>

        <button
          onClick={() =>
            (window.location.href = "/dashboard")
          }
          className="bg-blue-500 text-white px-5 py-3 rounded-xl"
        >
          กลับเมนูหลัก
        </button>
      </div>

      {events.length === 0 && (
        <div className="bg-white rounded-2xl p-10 text-center shadow">
          ยังไม่มีคิวงาน
        </div>
      )}

      <div className="space-y-4">
        {events.map((item, index) => (
          <div
            key={index}
            className="bg-white rounded-2xl shadow p-5"
          >
            <p>
              <strong>📅 วันงาน:</strong>{" "}
              {item.formattedEventDate || "-"}
            </p>

            <p>
              <strong>👤 ลูกค้า:</strong>{" "}
              {item.customerName}
            </p>

            <p>
              <strong>🎬 ประเภทงาน:</strong>{" "}
              {item.service}
            </p>

            <p>
              <strong>📍 สถานที่:</strong>{" "}
              {item.location}
            </p>

            <p>
              <strong>📞 เบอร์โทร:</strong>{" "}
              {item.phone}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
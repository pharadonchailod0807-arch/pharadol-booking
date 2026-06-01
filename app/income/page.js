

"use client";

import { useEffect, useState } from "react";

export default function IncomePage() {
  const [totalIncome, setTotalIncome] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [averageIncome, setAverageIncome] = useState(0);

  useEffect(() => {
    const archives =
      JSON.parse(localStorage.getItem("archives")) || [];

    let total = 0;

    archives.forEach((item) => {
      total += Number(item.finalPrice || item.price || 0);
    });

    setTotalIncome(total);
    setJobCount(archives.length);

    if (archives.length > 0) {
      setAverageIncome(
        Math.round(total / archives.length)
      );
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-100 p-10">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-bold">
          💰 รายได้สตูดิโอ
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
          <p className="text-zinc-500">รายได้ทั้งหมด</p>
          <h2 className="text-5xl font-bold mt-3 text-green-600">
            ฿ {totalIncome.toLocaleString()}
          </h2>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
          <p className="text-zinc-500">งานที่ปิดแล้ว</p>
          <h2 className="text-5xl font-bold mt-3">
            {jobCount}
          </h2>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
          <p className="text-zinc-500">ค่าเฉลี่ยต่องาน</p>
          <h2 className="text-5xl font-bold mt-3 text-blue-600">
            ฿ {averageIncome.toLocaleString()}
          </h2>
        </div>
      </div>
    </div>
  );
}
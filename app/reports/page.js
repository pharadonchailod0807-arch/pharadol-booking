"use client";

import { useEffect, useState } from "react";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [filterStatus, setFilterStatus] = useState("ทั้งหมด");
  const [filterJobStatus, setFilterJobStatus] = useState("ทั้งหมด");

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("customers") || "[]");
    setCustomers(data);
  }, []);

  const unpaidCount = customers.filter(c => c.paidAmount === 0).length;
  const depositCount = customers.filter(c => c.paidAmount > 0 && c.paidAmount < c.price).length;
  const paidCount = customers.filter(c => c.paidAmount >= c.price).length;

  const pendingJobs = customers.filter(c => c.jobStatus === "รอดำเนินการ").length;
  const shootingDoneJobs = customers.filter(c => c.jobStatus === "ถ่ายงานแล้ว").length;
  const editingJobs = customers.filter(c => c.jobStatus === "กำลังตัดต่อ").length;
  const deliveredJobs = customers.filter(c => c.jobStatus === "ส่งงานแล้ว").length;
  const closedJobs = customers.filter(c => c.jobStatus === "ปิดงาน").length;

  return (
    <div className="p-10">
      <h1 className="text-4xl font-bold mb-2">ลูกค้า</h1>
      <p className="text-zinc-500 mb-8">รายการลูกค้าและสถานะงาน</p>

      {/* Summary cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl shadow p-6">
          <p className="text-zinc-500">งานด่วนภายใน 3 วัน</p>
          <h2 className="text-3xl font-bold mt-2">{customers.filter(c => c.isUrgent).length}</h2>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <p className="text-red-600">ยังไม่มัดจำ</p>
          <h2 className="text-3xl font-bold text-red-600 mt-2">{unpaidCount}</h2>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <p className="text-blue-600">กำลังตัดต่อ</p>
          <h2 className="text-3xl font-bold text-blue-600 mt-2">{editingJobs}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

        <div>
          <label className="block text-sm font-semibold mb-2 text-zinc-600">
            💰 สถานะการชำระ
          </label>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full border rounded-xl p-3 bg-white"
          >
            <option value="ทั้งหมด">ทั้งหมด</option>
            <option value="ยังไม่มัดจำ">ยังไม่มัดจำ ({unpaidCount})</option>
            <option value="มัดจำแล้ว">มัดจำแล้ว ({depositCount})</option>
            <option value="ชำระครบแล้ว">ชำระครบแล้ว ({paidCount})</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2 text-zinc-600">
            🎬 สถานะงาน
          </label>

          <select
            value={filterJobStatus}
            onChange={(e) => setFilterJobStatus(e.target.value)}
            className="w-full border rounded-xl p-3 bg-white"
          >
            <option value="ทั้งหมด">งานทั้งหมด</option>
            <option value="รอดำเนินการ">🟡 รอดำเนินการ ({pendingJobs})</option>
            <option value="ถ่ายงานแล้ว">📷 ถ่ายงานแล้ว ({shootingDoneJobs})</option>
            <option value="กำลังตัดต่อ">🎬 กำลังตัดต่อ ({editingJobs})</option>
            <option value="ส่งงานแล้ว">📤 ส่งงานแล้ว ({deliveredJobs})</option>
            <option value="ปิดงาน">✅ ปิดงาน ({closedJobs})</option>
          </select>
        </div>

      </div>

      {/* Rest of the component... */}
    </div>
  );
}
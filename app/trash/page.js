"use client";

import { useEffect, useState } from "react";

export default function TrashPage() {
  const [trash, setTrash] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const data =
      JSON.parse(localStorage.getItem("trash")) || [];

    setTrash(data);
  }, []);

  const restoreCustomer = (indexToRestore) => {
    const customer = trash[indexToRestore];

    const customers =
      JSON.parse(localStorage.getItem("customers")) || [];

    customers.push({
      ...customer,
      status: "กำลังดำเนินการ",
    });

    localStorage.setItem(
      "customers",
      JSON.stringify(customers)
    );

    const updated = trash.filter(
      (_, index) => index !== indexToRestore
    );

    setTrash(updated);

    localStorage.setItem(
      "trash",
      JSON.stringify(updated)
    );

    alert("กู้คืนข้อมูลเรียบร้อย");
  };

  const deleteForever = (indexToDelete) => {
    if (!confirm("ยืนยันการลบถาวร ?")) return;

    const updated = trash.filter(
      (_, index) => index !== indexToDelete
    );

    setTrash(updated);

    localStorage.setItem(
      "trash",
      JSON.stringify(updated)
    );

    alert("ลบถาวรเรียบร้อย");
  };

  const clearTrash = () => {
    if (!confirm("ยืนยันการลบข้อมูลทั้งหมดในถังขยะ ?")) return;

    localStorage.removeItem("trash");
    setTrash([]);

    alert("ล้างถังขยะเรียบร้อย");
  };

  return (
    <div className="min-h-screen bg-zinc-100 p-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">
          🗑️ ถังขยะ
        </h1>
        <div className="flex gap-3">
          <button
            onClick={clearTrash}
            className="bg-red-600 text-white px-5 py-3 rounded-xl"
          >
            🗑️ ล้างถังขยะทั้งหมด
          </button>
          <button
            onClick={() =>
              (window.location.href = "/dashboard")
            }
            className="bg-blue-500 text-white px-5 py-3 rounded-xl"
          >
            กลับเมนูหลัก
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="ค้นหาชื่อลูกค้า หรือ เบอร์โทร"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded-xl p-4 mb-6"
      />

      <div className="bg-white rounded-2xl shadow p-4 mb-6">
        <p className="text-lg font-semibold">
          🗑️ รายการในถังขยะ {trash.length} รายการ
        </p>
      </div>

      <div className="space-y-4">
        {trash
          .filter((item) => {
            const keyword = search.toLowerCase();

            return (
              item.customerName
                ?.toLowerCase()
                .includes(keyword) ||
              item.phone
                ?.toLowerCase()
                .includes(keyword)
            );
          })
          .map((item, index) => (
            <div
              key={index}
              className="bg-white border rounded-2xl p-5 shadow"
            >
              <p><strong>เลขที่จอง:</strong> {item.bookingNumber}</p>
              <p><strong>ชื่อลูกค้า:</strong> {item.customerName}</p>
              <p><strong>เบอร์โทร:</strong> {item.phone}</p>
              <p><strong>ประเภทงาน:</strong> {item.service}</p>
              <p><strong>วันที่ลบ:</strong> {item.deletedDate}</p>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => restoreCustomer(index)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg"
                >
                  ♻️ กู้คืน
                </button>

                <button
                  onClick={() => deleteForever(index)}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg"
                >
                  ❌ ลบถาวร
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
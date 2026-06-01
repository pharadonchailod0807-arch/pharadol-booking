"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ArchivesPage() {
  const router = useRouter();
  const [archives, setArchives] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const data =
      JSON.parse(localStorage.getItem("archives")) || [];

    setArchives(data);
  }, []);

  const restoreCustomer = (indexToRestore) => {
    const customer = archives[indexToRestore];

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

    const updated = archives.filter(
      (_, index) => index !== indexToRestore
    );

    setArchives(updated);

    localStorage.setItem(
      "archives",
      JSON.stringify(updated)
    );

    alert("กู้คืนข้อมูลเรียบร้อย");
  };

  const deleteArchive = (indexToDelete) => {
    if (!confirm("ต้องการย้ายข้อมูลนี้ไปยังถังขยะหรือไม่?")) {
      return;
    }

    const trash =
      JSON.parse(localStorage.getItem("trash")) || [];

    trash.push({
      ...archives[indexToDelete],
      deletedDate: new Date().toLocaleDateString("th-TH"),
    });

    localStorage.setItem(
      "trash",
      JSON.stringify(trash)
    );

    const updated = archives.filter(
      (_, index) => index !== indexToDelete
    );

    setArchives(updated);

    localStorage.setItem(
      "archives",
      JSON.stringify(updated)
    );

    alert("ย้ายข้อมูลไปยังถังขยะเรียบร้อย");
  };

  return (
    <div className="min-h-screen bg-zinc-100 p-10">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold">
            📦 คลังข้อมูลลูกค้า
          </h1>

          <p className="text-zinc-600 mt-2">
            ข้อมูลลูกค้าที่ส่งมอบงานเรียบร้อยแล้ว
          </p>
        </div>

        <button
          onClick={() => router.push("/dashboard")}
          className="bg-blue-500 text-white px-5 py-3 rounded-xl"
        >
          ⬅️ กลับเมนูหลัก
        </button>
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
          📦 งานที่จัดเก็บแล้วทั้งหมด {archives.length} รายการ
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {archives
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
              className="bg-white border rounded-2xl p-5 shadow-lg hover:shadow-xl transition"
            >
              <p><strong>เลขที่จอง:</strong> {item.bookingNumber}</p>
              <p><strong>ชื่อลูกค้า:</strong> {item.customerName}</p>
              <p><strong>เบอร์โทร:</strong> {item.phone}</p>
              <p><strong>ประเภทงาน:</strong> {item.service}</p>
              <p><strong>ยอดงาน:</strong> ฿ {Number(item.finalPrice || item.price || 0).toLocaleString()}</p>
              <p><strong>สถานะ:</strong> {item.status || "ปิดงานแล้ว"}</p>
              <p><strong>วันที่ปิดงาน:</strong> {item.closedDate || "-"}</p>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => restoreCustomer(index)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg"
                >
                  ↩️ กู้คืนกลับมาดำเนินงาน
                </button>

                <button
                  onClick={() => deleteArchive(index)}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg"
                >
                  🗑️ ลบ
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
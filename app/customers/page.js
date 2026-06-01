"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function CustomersPage() {

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ทั้งหมด");
  const [filterJobStatus, setFilterJobStatus] = useState("ทั้งหมด");
  const [sortBy, setSortBy] = useState("eventDate");
  const [noteText, setNoteText] = useState("");
  const [selectedNoteIndex, setSelectedNoteIndex] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);

  const unpaidCount = customers.filter(
    (item) => (item.paymentStatus || "ยังไม่มัดจำ") === "ยังไม่มัดจำ"
  ).length;

  const depositCount = customers.filter(
    (item) => item.paymentStatus === "มัดจำแล้ว"
  ).length;

  const paidCount = customers.filter(
    (item) => item.paymentStatus === "ชำระครบแล้ว"
  ).length;

  const pendingJobs = customers.filter(
    (item) => (item.jobStatus || "รอดำเนินการ") === "รอดำเนินการ"
  ).length;

  const shootingDoneJobs = customers.filter(
    (item) => item.jobStatus === "ถ่ายงานแล้ว"
  ).length;

  const editingJobs = customers.filter(
    (item) => item.jobStatus === "กำลังตัดต่อ"
  ).length;

  const deliveredJobs = customers.filter(
    (item) => item.jobStatus === "ส่งงานแล้ว"
  ).length;

  const closedJobs = customers.filter(
    (item) => item.jobStatus === "ปิดงาน"
  ).length;

  const activeJobs = customers.filter(
    (item) => (item.jobStatus || "รอดำเนินการ") !== "ปิดงาน"
  ).length;

  const totalRevenue = customers.reduce(
    (sum, item) => sum + Number(item.price || 0),
    0
  );

  const receivedRevenue = customers.reduce(
    (sum, item) => sum + Number(item.paidAmount || 0),
    0
  );

  const outstandingRevenue = customers.reduce(
    (sum, item) =>
      sum + Number(item.remainingAmount ?? item.price ?? 0),
    0
  );



  const today = new Date();

  const jobsThisWeek = customers.filter((item) => {
    if (!item.eventDate) return false;

    const eventDate = new Date(item.eventDate);
    const diffDays = Math.floor(
      (eventDate - today) / (1000 * 60 * 60 * 24)
    );

    return diffDays >= 0 && diffDays <= 7;
  }).length;

  const jobsThisMonth = customers.filter((item) => {
    if (!item.eventDate) return false;

    const eventDate = new Date(item.eventDate);

    return (
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getFullYear() === today.getFullYear()
    );
  }).length;

  const urgentJobs = customers.filter((item) => {
    if (!item.eventDate) return false;

    const diffDays = Math.floor(
      (new Date(item.eventDate) - today) /
      (1000 * 60 * 60 * 24)
    );

    return diffDays >= 0 && diffDays <= 3;
  }).length;

  const todayJobs = customers.filter((item) => {
    if (!item.eventDate) return false;

    const diffDays = Math.floor(
      (new Date(item.eventDate) - today) /
      (1000 * 60 * 60 * 24)
    );

    return diffDays === 0;
  }).length;



  useEffect(() => {

    const data =
      JSON.parse(
        localStorage.getItem("customers")
      ) || [];

    setCustomers(data);

  }, []);


  const deleteCustomer = (indexToDelete) => {
    const trash =
      JSON.parse(localStorage.getItem("trash")) || [];

    trash.push({
      ...customers[indexToDelete],
      deletedDate: new Date().toLocaleDateString("th-TH"),
    });

    localStorage.setItem(
      "trash",
      JSON.stringify(trash)
    );

    const updated = customers.filter(
      (_, index) => index !== indexToDelete
    );

    setCustomers(updated);

    localStorage.setItem(
      "customers",
      JSON.stringify(updated)
    );

    alert("ย้ายข้อมูลไปถังขยะเรียบร้อย");
  };

  const archiveCustomer = (indexToArchive) => {
    const archives =
      JSON.parse(
        localStorage.getItem("archives")
      ) || [];

    const customerToArchive = {
      ...customers[indexToArchive],
      status: "จัดเก็บ"
    };

    archives.push(customerToArchive);

    localStorage.setItem(
      "archives",
      JSON.stringify(archives)
    );

    const updated =
      customers.filter(
        (_, index) =>
          index !== indexToArchive
      );

    setCustomers(updated);

    localStorage.setItem(
      "customers",
      JSON.stringify(updated)
    );

    alert("จัดเก็บข้อมูลเรียบร้อยแล้ว");
  };

  const updatePaymentStatus = (index, status) => {
    const updated = [...customers];

    const totalPrice = Number(updated[index].price || 0);

    let paidAmount = 0;
    let remainingAmount = totalPrice;

    if (status === "มัดจำแล้ว") {
      paidAmount = totalPrice * 0.5;
      remainingAmount = totalPrice - paidAmount;
    }

    if (status === "ชำระครบแล้ว") {
      paidAmount = totalPrice;
      remainingAmount = 0;
    }

    updated[index] = {
      ...updated[index],
      paymentStatus: status,
      paidAmount,
      remainingAmount,
    };

    setCustomers(updated);

    localStorage.setItem(
      "customers",
      JSON.stringify(updated)
    );
  };

  const updateJobStatus = (index, status) => {
    const updated = [...customers];

    updated[index] = {
      ...updated[index],
      jobStatus: status,
    };

    setCustomers(updated);

    localStorage.setItem(
      "customers",
      JSON.stringify(updated)
    );
  };

  const saveNote = () => {
    if (selectedNoteIndex === null) return;

    const updated = [...customers];

    updated[selectedNoteIndex] = {
      ...updated[selectedNoteIndex],
      note: noteText,
    };

    setCustomers(updated);

    localStorage.setItem(
      "customers",
      JSON.stringify(updated)
    );

    setShowNoteModal(false);
    setNoteText("");
    setSelectedNoteIndex(null);
  };

  const exportToExcel = () => {
    const excelData = customers.map((item) => ({
      "เลขที่จอง": item.bookingNumber || "-",
      "ชื่อลูกค้า": item.customerName || "-",
      "เบอร์โทร": item.phone || "-",
      "ประเภทงาน": item.service || "-",
      "สถานที่": item.location || "-",
      "วันที่งาน": item.eventDate
        ? new Date(item.eventDate).toLocaleDateString("th-TH")
        : "-",
      "ยอดงาน": Number(item.price || 0),
      "ชำระแล้ว": Number(item.paidAmount || 0),
      "คงเหลือ": Number(item.remainingAmount ?? item.price ?? 0),
      "สถานะงาน": item.jobStatus || "รอดำเนินการ",
      "สถานะชำระ": item.paymentStatus || "ยังไม่มัดจำ",
      "หมายเหตุ": item.note || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Customers"
    );

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(
      fileData,
      `customers-${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  return (

    <div className="p-4 md:p-6 max-w-[1600px] mx-auto text-sm">

      <h1 className="text-2xl font-bold mb-1">
        รายชื่อลูกค้า
      </h1>

      <p className="text-zinc-600 mb-3 text-sm">
        จำนวนลูกค้าทั้งหมด {customers.length} รายการ
      </p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => window.location.href = "/dashboard"}
          className="bg-blue-500 text-white px-4 py-2 rounded-xl"
        >
          กลับ Dashboard
        </button>

        <button
          onClick={() => window.location.href = "/archives"}
          className="bg-yellow-500 text-white px-4 py-2 rounded-xl"
        >
          คลังข้อมูล
        </button>
        <button
          onClick={exportToExcel}
          className="bg-green-600 text-white px-4 py-2 rounded-xl"
        >
          📊 Export Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-blue-500 text-white rounded-xl p-2 shadow-md">
          <p>📅 งานใน 7 วันข้างหน้า</p>
          <p className="text-xl font-bold">
            {jobsThisWeek}
          </p>
        </div>
        <div className="bg-purple-500 text-white rounded-xl p-2 shadow-md">
          <p>🔥 งานในเดือนนี้</p>
          <p className="text-xl font-bold">
            {jobsThisMonth}
          </p>
        </div>
      </div>

      <input
        type="text"
        placeholder="ค้นหาชื่อลูกค้า หรือ เบอร์โทร"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded-lg p-2 mb-3"
      />



      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-sm font-semibold mb-1 text-zinc-600">
            💰 สถานะการชำระ
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full border rounded-lg p-2 bg-white text-sm"
          >
            <option value="ทั้งหมด">ทั้งหมด</option>
            <option value="ยังไม่มัดจำ">ยังไม่มัดจำ ({unpaidCount})</option>
            <option value="มัดจำแล้ว">มัดจำแล้ว ({depositCount})</option>
            <option value="ชำระครบแล้ว">ชำระครบแล้ว ({paidCount})</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-zinc-600">
            📊 เรียงข้อมูล
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full border rounded-lg p-2 bg-white text-sm"
          >
            <option value="eventDate">📅 วันที่งานใกล้สุด</option>
            <option value="price">💰 มูลค่างานสูงสุด</option>
            <option value="customerName">👤 ชื่อลูกค้า A-Z</option>
            <option value="remaining">💸 ยอดค้างชำระสูงสุด</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-zinc-600">
            🎬 สถานะงาน
          </label>
          <select
            value={filterJobStatus}
            onChange={(e) => setFilterJobStatus(e.target.value)}
            className="w-full border rounded-lg p-2 bg-white text-sm"
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border rounded-xl p-3 text-center shadow-sm">
          <p className="text-zinc-500 text-xs">👥 ลูกค้าทั้งหมด</p>
          <p className="text-2xl font-bold">{customers.length}</p>
        </div>

        <div className="bg-white border rounded-xl p-3 text-center shadow-sm">
          <p className="text-zinc-500 text-xs">📂 งานที่ดำเนินการ</p>
          <p className="text-2xl font-bold text-blue-600">{activeJobs}</p>
        </div>

        <div className="bg-white border rounded-xl p-3 text-center shadow-sm">
          <p className="text-zinc-500 text-xs">✅ ปิดงานแล้ว</p>
          <p className="text-2xl font-bold text-green-600">{closedJobs}</p>
        </div>

        <div className="bg-white border rounded-xl p-3 text-center shadow-sm">
          <p className="text-zinc-500 text-xs">💳 ค้างมัดจำ</p>
          <p className="text-2xl font-bold text-red-600">{unpaidCount}</p>
        </div>
      </div>


      <div className="bg-white rounded-2xl shadow-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100">
            <tr>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">#</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">ลูกค้า</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">วันที่งาน</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">สถานที่</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">ประเภทงาน</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">ยอดงาน</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">ชำระแล้ว</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">คงเหลือ</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">สถานะงาน</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap">สถานะชำระ</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap min-w-[280px]">จัดการ</th>
              <th className="text-center p-4 text-sm font-bold whitespace-nowrap min-w-[240px]">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>

        {customers
          .filter((item) => {

            const keyword =
              search.toLowerCase();

            const matchesSearch =
              item.customerName
                ?.toLowerCase()
                .includes(keyword) ||
              item.phone
                ?.toLowerCase()
                .includes(keyword);

            const currentStatus =
              item.paymentStatus || "ยังไม่มัดจำ";

            const matchesStatus =
              filterStatus === "ทั้งหมด"
                ? true
                : currentStatus === filterStatus;

            const currentJobStatus =
              item.jobStatus || "รอดำเนินการ";

            const matchesJobStatus =
              filterJobStatus === "ทั้งหมด"
                ? true
                : currentJobStatus === filterJobStatus;

            return (
              matchesSearch &&
              matchesStatus &&
              matchesJobStatus
            );
          })
          .sort((a, b) => {

            if (sortBy === "price") {
              return Number(b.price || 0) - Number(a.price || 0);
            }

            if (sortBy === "customerName") {
              return (a.customerName || "").localeCompare(
                b.customerName || ""
              );
            }

            if (sortBy === "remaining") {
              return Number(b.remainingAmount || 0) - Number(a.remainingAmount || 0);
            }

            if (!a.eventDate) return 1;
            if (!b.eventDate) return -1;

            return new Date(a.eventDate) - new Date(b.eventDate);
          })
          .map((item, index) => {

            const realIndex = customers.findIndex(
              (c) => c.bookingNumber === item.bookingNumber
            );

            const diffDays = item.eventDate
              ? Math.floor(
                  (new Date(item.eventDate) - new Date()) /
                    (1000 * 60 * 60 * 24)
                )
              : null;

            return (
            <tr
              key={index}
              className={`border-t hover:bg-zinc-50 even:bg-zinc-50/40 ${
                diffDays === 0
                  ? "bg-red-50"
                  : diffDays > 0 && diffDays <= 3
                  ? "bg-orange-50"
                  : ""
              }`}
            >
              <td className="p-4 text-center align-middle font-semibold text-zinc-500">
                {index + 1}
              </td>
              <td className="p-4 text-center align-middle">
                <div className="flex flex-col items-center">
                  <div className="font-semibold">{item.customerName}</div>
                  <div className="text-zinc-500 text-xs">{item.phone}</div>
                </div>
              </td>
              <td className="p-4 text-center align-middle">
                {!item.eventDate ? (
                  "-"
                ) : diffDays === 0 ? (
                  <span className="font-bold text-red-600">
                    🚨 วันนี้
                  </span>
                ) : diffDays > 0 && diffDays <= 3 ? (
                  <span className="font-bold text-orange-600">
                    🔥 อีก {diffDays} วัน
                  </span>
                ) : diffDays > 3 && diffDays <= 7 ? (
                  <span className="font-semibold text-yellow-600">
                    ⏰ อีก {diffDays} วัน
                  </span>
                ) : (
                  new Date(item.eventDate).toLocaleDateString("th-TH")
                )}
              </td>
              <td className="p-4 text-center align-middle">
                {item.location || "-"}
              </td>
              <td className="p-4 text-center align-middle">{item.service}</td>
              <td className="p-4 text-center align-middle font-semibold">
                ฿ {Number(item.price || 0).toLocaleString()}
              </td>
              <td className="p-4 text-center align-middle text-green-600 font-semibold">
                ฿ {Number(item.paidAmount || 0).toLocaleString()}
              </td>
              <td className="p-4 text-center align-middle text-red-600 font-semibold">
                ฿ {Number((item.remainingAmount ?? item.price) || 0).toLocaleString()}
              </td>
              <td className="p-4 text-center align-middle">
                <select
                  value={item.jobStatus || "รอดำเนินการ"}
                  onChange={(e) =>
                    updateJobStatus(realIndex, e.target.value)
                  }
                  className={`mx-auto block px-4 py-2 rounded-xl text-sm font-semibold text-white border-0 ${
                    item.jobStatus === "ปิดงาน"
                      ? "bg-green-700"
                      : item.jobStatus === "ส่งงานแล้ว"
                      ? "bg-emerald-500"
                      : item.jobStatus === "กำลังตัดต่อ"
                      ? "bg-blue-500"
                      : item.jobStatus === "ถ่ายงานแล้ว"
                      ? "bg-purple-500"
                      : "bg-yellow-500"
                  }`}
                >
                  <option value="รอดำเนินการ">🟡 รอดำเนินการ</option>
                  <option value="ถ่ายงานแล้ว">📷 ถ่ายงานแล้ว</option>
                  <option value="กำลังตัดต่อ">🎬 กำลังตัดต่อ</option>
                  <option value="ส่งงานแล้ว">📤 ส่งงานแล้ว</option>
                  <option value="ปิดงาน">✅ ปิดงาน</option>
                </select>
              </td>
              <td className="p-4 text-center align-middle min-w-[220px]">
                <select
                  value={item.paymentStatus || "ยังไม่มัดจำ"}
                  onChange={(e) =>
                    updatePaymentStatus(realIndex, e.target.value)
                  }
                  className={`mx-auto block px-4 py-2 rounded-xl text-sm font-semibold text-white border-0 ${
                    item.paymentStatus === "ชำระครบแล้ว"
                      ? "bg-green-600"
                      : item.paymentStatus === "มัดจำแล้ว"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                >
                  <option value="ยังไม่มัดจำ">🔴 ยังไม่มัดจำ</option>
                  <option value="มัดจำแล้ว">🟡 มัดจำแล้ว</option>
                  <option value="ชำระครบแล้ว">🟢 ชำระครบแล้ว</option>
                </select>
              </td>
              <td className="p-4 text-center align-middle min-w-[280px]">
                <div className="flex justify-center items-center gap-2">
                  <button
                    onClick={() => {
                      localStorage.setItem(
                        "selectedBooking",
                        JSON.stringify(item)
                      );
                      window.location.href = "/booking-view";
                    }}
                    className="px-3 py-2 rounded-lg text-sm text-white bg-blue-500"
                  >
                    PDF
                  </button>

                  <button
                    onClick={() => archiveCustomer(realIndex)}
                    className="px-3 py-2 rounded-lg text-sm text-white bg-yellow-500"
                  >
                    จัดเก็บ
                  </button>

                  <button
                    onClick={() => deleteCustomer(realIndex)}
                    className="px-3 py-2 rounded-lg text-sm text-white bg-red-500"
                  >
                    ลบ
                  </button>
                </div>
              </td>
              <td className="p-4 text-center align-middle min-w-[240px]">
                <div className="flex flex-col items-center justify-center gap-3 h-full">
                  <button
                    onClick={() => {
                      setSelectedNoteIndex(realIndex);
                      setNoteText(item.note || "");
                      setShowNoteModal(true);
                    }}
                    className="bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    📝 หมายเหตุ
                  </button>

                  <div className="text-sm text-zinc-500 text-center w-full break-words px-2">
                    {item.note || "-"}
                  </div>
                </div>
              </td>
            </tr>
              );
          })}

          </tbody>
        </table>
      </div>
    {/* Note Modal */}
    {showNoteModal && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-4 w-full max-w-lg">
          <h2 className="text-lg font-bold mb-2">
            📝 หมายเหตุลูกค้า
          </h2>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={5}
            className="w-full border rounded-lg p-2 text-sm"
            placeholder="เช่น โทรยืนยันแล้ว / รอส่งไฟล์ / นัดส่งงานวันที่..."
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setShowNoteModal(false)}
              className="px-3 py-1 border rounded-lg text-sm"
            >
              ยกเลิก
            </button>
            <button
              onClick={saveNote}
              className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm"
            >
              บันทึก
            </button>
          </div>
        </div>
      </div>
    )}

    </div>

  );

}
"use client";

import React, { useState, useEffect } from "react";
import Barcode from "react-barcode";

export default function BookingSystem() {

  useEffect(() => {

    const loggedIn =
      localStorage.getItem("loggedIn");

    if (!loggedIn) {
      window.location.href = "/login";
    }

  }, []);

  // FORM STATE


  // =========================
  // FORM STATE
  // =========================

const [customerName, setCustomerName] = useState("");
const [phone, setPhone] = useState("");
const [service, setService] = useState("");
const [location, setLocation] = useState("");
const [eventDate, setEventDate] = useState("");
const [price, setPrice] = useState("");
const [deposit, setDeposit] = useState("");
const [discountPercent, setDiscountPercent] = useState("");
const [discountAmount, setDiscountAmount] = useState("");

const [slipImage, setSlipImage] = useState("");

const [bookingDate, setBookingDate] = useState("");
const [today, setToday] = useState("");

const [filterStatus, setFilterStatus] = useState("ทั้งหมด");
const [filterJobStatus, setFilterJobStatus] = useState("ทั้งหมด");
const [customerCount, setCustomerCount] = useState(0);

useEffect(() => {
  const now = new Date();
  setBookingDate(
    now.toLocaleString("th-TH")
  );
  setToday(
    now.toLocaleDateString("th-TH")
  );
  const customers = JSON.parse(
    localStorage.getItem("customers") || "[]"
  );
  setCustomerCount(customers.length);
}, []);

  // =========================
  // DATE
  // =========================


const todayRaw = new Date();

const runningNumber = String(
  customerCount + 1
).padStart(3, "0");

const bookingNumber = `BK-${todayRaw.getFullYear()}${String(
  todayRaw.getMonth() + 1
).padStart(2, "0")}${String(
  todayRaw.getDate()
).padStart(2, "0")}-${runningNumber}`;

const formattedEventDate =

  eventDate

    ? new Date(eventDate).toLocaleDateString("th-TH")

    : "-";
  const percentDiscountValue =
  (Number(price || 0) * Number(discountPercent || 0)) / 100;

const totalDiscount =
  percentDiscountValue + Number(discountAmount || 0);

const finalPrice =
  Number(price || 0) - totalDiscount;

const remaining =
  finalPrice - Number(deposit || 0);

  // =========================
  // PDF
  // =========================
  const saveCustomer = () => {
    const customer = {
      bookingNumber,
      customerName,
      phone,
      service,
      location,
      eventDate,
      formattedEventDate,
      bookingDate,
      today,
      price,
      deposit,
      discountPercent,
      discountAmount,
      totalDiscount,
      finalPrice,
      remaining,
      slipImage,
    };

  const oldData =

    JSON.parse(

      localStorage.getItem("customers")

    ) || [];

    oldData.push(customer);

    localStorage.setItem(
      "customers",
      JSON.stringify(oldData)
    );

    console.log("Saved customer:", customer);
    alert("บันทึกข้อมูลสำเร็จ");
  };
const downloadPDF = () => {

  window.print();

};

  return (

    <div className="min-h-screen bg-zinc-100">

      {/* ========================= */}
      {/* BACK OFFICE */}
      {/* ========================= */}

      <div className="no-print fixed left-0 top-0 w-[360px] h-screen overflow-y-auto bg-white border-r p-8 shadow-xl z-50">

        <h1 className="text-3xl font-bold mb-8">
          ระบบสร้างใบจอง
        </h1>

        <div className="space-y-5 pb-40">

          <input
            type="text"
            placeholder="ชื่อลูกค้า"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full border rounded-2xl px-5 py-4 outline-none"
          />

          <input
            type="text"
            placeholder="เบอร์โทรศัพท์"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border rounded-2xl px-5 py-4 outline-none"
          />

          <input
            type="text"
            placeholder="ประเภทงาน"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full border rounded-2xl px-5 py-4 outline-none"
          />

          <input
            type="text"
            placeholder="สถานที่"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full border rounded-2xl px-5 py-4 outline-none"
          />

          <input
            type="datetime-local"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full border rounded-2xl px-5 py-4 outline-none"
          />
          <input
            type="number"
            placeholder="ราคาเต็ม"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full border rounded-2xl px-5 py-4 outline-none"
          />

          <input
            type="number"
            placeholder="ราคามัดจำ"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            className="w-full border rounded-2xl px-5 py-4 outline-none"
          />
          <div className="border-2 border-blue-500 rounded-2xl p-4 bg-blue-50">
            <p className="font-bold text-blue-700 mb-3">
              ระบบส่วนลด
            </p>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="ลด (%)"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="w-full border rounded-2xl px-5 py-4 outline-none bg-white"
              />

              <input
                type="number"
                placeholder="ลด (บาท)"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="w-full border rounded-2xl px-5 py-4 outline-none bg-white"
              />
            </div>

            <div className="mt-3 rounded-xl bg-white p-3 border text-sm space-y-1">
              <div>ราคาเต็ม : ฿ {Number(price || 0).toLocaleString()}</div>
              <div>ส่วนลดจาก % : ฿ {percentDiscountValue.toLocaleString()}</div>
              <div>ส่วนลดเพิ่ม : ฿ {Number(discountAmount || 0).toLocaleString()}</div>
              <div>ส่วนลดรวม : ฿ {totalDiscount.toLocaleString()}</div>
              <div className="font-bold text-green-700 text-base">
                ยอดสุทธิ : ฿ {finalPrice.toLocaleString()}
              </div>
            </div>
          </div>

          <input
  type="file"
  accept="image/*"
  onChange={(e) => {

    const file =
      e.target.files[0];

    const reader =
      new FileReader();

    reader.onloadend = () => {
      setSlipImage(reader.result);
    };

    if (file) {
      reader.readAsDataURL(file);
    }

  }}
  className="w-full border rounded-2xl px-5 py-4"
/>
{slipImage && (

  <img
    src={slipImage}
    alt="Slip Preview"
    className="w-full rounded-2xl border mt-3"
  />

)}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <button
            onClick={downloadPDF}
            className="bg-black text-white rounded-2xl py-4 font-semibold"
          >
            ดาวน์โหลด PDF
          </button>

          <button
            onClick={saveCustomer}
            className="bg-green-600 text-white rounded-2xl py-4"
          >
            บันทึกข้อมูล
          </button>

          <button
            onClick={() => window.location.href = "/customers"}
            className="bg-blue-600 text-white rounded-2xl py-4"
          >
            ดูข้อมูลลูกค้า
          </button>
          <button
            onClick={() => window.location.href = "/archives"}
            className="bg-yellow-600 text-white rounded-2xl py-4"
          >
            📦 คลังข้อมูล
          </button>
          <button
            onClick={() => window.location.href = "/trash"}
            className="bg-red-500 text-white rounded-2xl py-4"
          >
            🗑️ ถังขยะ
          </button>

          <button
            onClick={() => window.location.href = "/dashboard"}
            className="bg-purple-600 text-white rounded-2xl py-4"
          >
            เมนูหลัก
          </button>

          <button
            onClick={() => {
              localStorage.removeItem("loggedIn");
              window.location.href = "/login";
            }}
            className="col-span-2 bg-red-600 text-white rounded-2xl py-4 font-semibold"
          >
            ออกจากระบบ
          </button>
        </div>

      </div>

      {/* ========================= */}
      {/* FRONT DOCUMENT */}
      {/* ========================= */}

      <div className="print-container ml-[380px] p-10">
        <div
          className="print-area bg-white w-[210mm] mx-auto shadow-2xl p-8" 
        >

          {/* HEADER */}

         <div className="flex justify-between items-start border-b pb-6">

            <div className="flex items-center gap-5">

              <img
                src="/logo.png"
                alt="logo"
                className="w-28 h-28 rounded-full object-cover"
              />

              <div>

                <h1 className="text-3xl font-bold leading-tight">
                  Adisorn Wedding Studio
                </h1>

                <p className="mt-2 text-black text-sm">
                   ต.ในเมือง อ.เมืองนครราชสีมา
                </p>

                <p className="text-zinc-600 text-sm">
                  จังหวัดนครราชสีมา 30000
                </p>

                <p className="text-zinc-600 text-lg">
                  โทร. 0000000
                </p>

              </div>

            </div>

            <div className="ml-auto flex flex-col items-end">

              <Barcode
                value={bookingNumber}
                width={1}
                height={45}
                margin={0}
                displayValue={false}
              />

              <p className="text-xl font-bold mt-3 whitespace-nowrap">
                {bookingNumber}
              </p>

              <p className="text-black mt-2">
                วันที่จอง : {bookingDate}
              </p>

            </div>

          </div>

          {/* TITLE */}

          <div className="text-center py-5">

            <h2 className="text-4xl font-bold">
              ใบสำคัญการจอง
            </h2>

          </div>

          {/* INFO */}

          <div className="grid grid-cols-2 gap-10 mb-8">

            <div>

              <h3 className="text-2xl font-bold mb-5">
                ข้อมูลลูกค้า
              </h3>

              <div className="space-y-1 text-lg">

                <p>
                  ชื่อลูกค้า : {customerName || "-"}
                </p>

                <p>
                  เบอร์โทรศัพท์ : {phone || "-"}
                </p>

              </div>

            </div>

            <div>

              <h3 className="text-2xl font-bold mb-3">
                รายละเอียดการจอง
              </h3>

              <div className="space-y-1 text-lg">
                <p>
                  ประเภทงาน : {service || "-"}
                </p>
                <p>
                  สถานที่ : {location || "-"}
                </p>
                <p>
                  วันเริ่มงาน : {formattedEventDate}
                </p>
              </div>

            </div>

          </div>

          {/* TABLE */}

          <div className="border rounded-3xl overflow-hidden mb-16">

            <div className="grid grid-cols-4 bg-zinc-100 p-4 font-bold text-lg">

              <div>รายละเอียด</div>
              <div>วันเริ่มงาน</div>
              <div>มัดจำ</div>
              <div>ยอดรวม</div>

            </div>

            <div className="grid grid-cols-4 p-5 text-xl border-t">

              <div>{service || "-"}</div>

              <div>
                {formattedEventDate}
              </div>

              <div>
                ฿ {Number(deposit || 0).toLocaleString()}
              </div>

              <div>
                ฿ {finalPrice.toLocaleString()}
              </div>

            </div>

          </div>

          {/* SUMMARY */}

          <div className="flex justify-end mb-10">

            <div className="w-[520px] border rounded-3xl p-8">

              <div className="space-y-3 text-xl">

                <div className="flex justify-between">
                  <span>ยอดเต็ม</span>
                  <span>฿ {Number(price || 0).toLocaleString()}</span>
                </div>

                <div className="flex justify-between">
                  <span>ยอดมัดจำ</span>
                  <span>฿ {Number(deposit || 0).toLocaleString()}</span>
                </div>

                <div className="flex justify-between text-red-600">
                  <span>ส่วนลด</span>
                  <span>-฿ {totalDiscount.toLocaleString()}</span>
                </div>

                <div className="flex justify-between">
                  <span>ยอดคงเหลือ</span>
                  <span>฿ {remaining.toLocaleString()}</span>
                </div>

                <div className="border-t pt-4 mt-2 flex justify-between items-center font-bold">
                  <span className="text-5xl">ยอดรวมสุทธิ</span>
                  <span className="text-5xl">฿ {finalPrice.toLocaleString()}</span>
                </div>

              </div>

            </div>

          </div>

          {/* SIGNATURE */}

          <div className="grid grid-cols-2 gap-6 mt-10">

            <div className="border-2 rounded-3xl p-2 h-40 flex flex-col justify-between text-center">

              <p className="text-2xl font-semibold">
                ลูกค้า
              </p>

              <div className="border-b"></div>

              <p className="text-zinc-500 text-base mt-2">
                วันที่ ........../........../..........
              </p>

            </div>

            <div className="border-2 rounded-3xl p-1 h-40 flex flex-col justify-between text-center">

              <div>

                <p className="text-xl font-semibold">
                  Adisorn Wedding Studio
                </p>

                <div className="flex justify-center mt-5">

                  <img
                    src="/signature.png"
                    alt="signature"
                    className="h-16 object-contain mx-auto"
                  />

                </div>

              </div>

                            <p className="text-zinc-500 text-lg">
                วันที่ {today}
              </p>

            </div>

          </div>

        </div>

      </div>

      {/* PRINT STYLE */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        @media print {

          body {
            background: white !important;

            -webkit-print-color-adjust: exact !important;

              print-color-adjust: exact !important;
          }

          .no-print {
            display: none !important;
          }

          .print-container {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          .print-area {
            width: 190mm !important;
            min-height: 277mm !important;

            margin: auto !important;

            padding: 10mm !important;

            box-shadow: none !important;

            zoom: 0.82;
            transform-origin: top center;
    }
  }
`}</style>

    </div>
  );
}

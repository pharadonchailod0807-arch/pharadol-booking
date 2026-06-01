"use client";

import { useEffect, useState } from "react";
import Barcode from "react-barcode";

export default function BookingView() {

  const [data, setData] = useState(null);

  useEffect(() => {

    const bookingData =
      localStorage.getItem("selectedBooking");

    if (bookingData) {
      setData(JSON.parse(bookingData));
    }

  }, []);


  if (!data) {
    return (
      <div className="p-10">
        <h1 className="text-2xl font-bold">
          ไม่พบข้อมูลการจอง
        </h1>
        <button
          onClick={() =>
            window.location.href = "/customers"
          }
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-xl"
        >
          กลับหน้าลูกค้า
        </button>
      </div>
    );
  }

  // Inserted: calculations and formatting
  const originalPrice = Number(data.price || 0);
  const discountPercent = Number(data.discountPercent || 0);
  const discountAmount = Number(data.discountAmount || 0);

  const percentDiscountValue =
    originalPrice * (discountPercent / 100);

  const totalDiscount =
    percentDiscountValue + discountAmount;

  const finalPrice = Math.max(
    originalPrice - totalDiscount,
    0
  );

  const remaining =
    finalPrice - Number(data.deposit || 0);

  const formattedEventDate =
    data.formattedEventDate ||
    (data.eventDate
      ? new Date(data.eventDate).toLocaleDateString("th-TH")
      : "-");

  const bookingDate =
    data.bookingDate || new Date().toLocaleString("th-TH");

  return (
    <div className="min-h-screen bg-zinc-100 p-10">

      <div className="flex gap-3 mb-6 no-print">
        <button
          onClick={() =>
            window.location.href = "/customers"
          }
          className="bg-blue-500 text-white px-4 py-2 rounded-xl"
        >
          ← กลับ
        </button>
        <button
          onClick={() => window.print()}
          className="bg-green-600 text-white px-4 py-2 rounded-xl"
        >
          ดาวน์โหลด PDF
        </button>
      </div>

      <div className="print-area bg-white w-[210mm] min-h-[297mm] mx-auto shadow-2xl p-10">

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

              <p className="mt-2 text-sm">
                ต.ในเมือง อ.เมืองนครราชสีมา
              </p>

              <p className="text-sm">
                จังหวัดนครราชสีมา 30000
              </p>

              <p className="text-lg">
                โทร. 0000000
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-col items-end">

            <Barcode
              value={data.bookingNumber || "BOOKING"}
              width={1}
              height={45}
              margin={0}
              displayValue={false}
            />

            <p className="text-xl font-bold mt-3 whitespace-nowrap">
              {data.bookingNumber}
            </p>

            <p className="mt-2 text-lg">
              วันที่จอง : {bookingDate}
            </p>

          </div>
        </div>

        <div className="text-center py-5">
          <h2 className="text-5xl font-bold">
            ใบสำคัญการจอง
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-10 mb-12 mt-4">
          <div>
            <h3 className="text-2xl font-bold mb-4">
              ข้อมูลลูกค้า
            </h3>
            <p>เลขที่จอง : {data.bookingNumber}</p>
            <p>ชื่อลูกค้า : {data.customerName || "-"}</p>
            <p>เบอร์โทรศัพท์ : {data.phone || "-"}</p>
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-4">
              รายละเอียดการจอง
            </h3>
            <p>ประเภทงาน : {data.service || "-"}</p>
            <p>สถานที่ : {data.location || "-"}</p>
            <p>วันเริ่มงาน : {formattedEventDate}</p>
          </div>
        </div>

        <div className="border rounded-3xl overflow-hidden mb-10">
          <div className="grid grid-cols-4 bg-zinc-100 p-4 font-bold">
            <div>รายละเอียด</div>
            <div>วันเริ่มงาน</div>
            <div>มัดจำ</div>
            <div>ยอดรวม</div>
          </div>
          <div className="grid grid-cols-4 p-5 text-xl border-t">
            <div>{data.service || "-"}</div>
            <div>{formattedEventDate}</div>
            <div>฿ {Number(data.deposit || 0).toLocaleString()}</div>
            <div>฿ {finalPrice.toLocaleString()}</div>
          </div>
        </div>

        <div className="flex justify-end mb-10">
          <div className="w-[520px] border rounded-3xl p-8">
            <div className="space-y-3 text-xl">
              <div className="flex justify-between">
                <span>ยอดเต็ม</span>
                <span>฿ {originalPrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>ยอดมัดจำ</span>
                <span>฿ {Number(data.deposit || 0).toLocaleString()}</span>
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

        {data.slipImage && (
          <div className="mb-10">
            <h3 className="text-xl font-bold mb-3">สลิปการโอนเงิน</h3>
            <img src={data.slipImage} alt="Slip" className="w-80 border rounded-xl" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 mt-16">

          <div className="border-2 rounded-3xl p-4 h-48 flex flex-col justify-between text-center">
            <p className="text-2xl font-semibold">
              ลูกค้า
            </p>

            <div className="border-b"></div>

            <p>
              วันที่ ........../........../..........
            </p>
          </div>

          <div className="border-2 rounded-3xl p-4 h-48 flex flex-col justify-between text-center">

            <p className="text-xl font-semibold">
              Adisorn Wedding Studio
            </p>

            <div className="flex justify-center">
              <img
                src="/signature.png"
                alt="signature"
                className="h-16 object-contain"
              />
            </div>

            <p>
              วันที่ {bookingDate}
            </p>

          </div>

        </div>

      </div>
      
      <style jsx global>{`
@page {
  size: A4 portrait;
  margin: 0;
}

@media print {
  .no-print {
    display: none !important;
  }

  body {
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-area {
    width: 210mm !important;
    min-height: 297mm !important;
    box-shadow: none !important;
    margin: 0 auto !important;
  }
}
`}</style>
    </div>
  );
}
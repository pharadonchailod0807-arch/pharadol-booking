"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";

const BRAND_ID = "adisorn";

export default function ArchivesPage() {
  const router = useRouter();
  const brandChrome = getBrandChromeStyles(BRAND_ID);
  const ARCHIVES_KEY = "adisorn_archives";
  const [archives, setArchives] = useState([]);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    try {
      const loggedIn = sessionStorage.getItem("loggedIn") === "true";
      const currentUser = JSON.parse(
        sessionStorage.getItem("currentUser") || "null"
      );
      const activeBrand = sessionStorage.getItem("activeBrand");
      const users = JSON.parse(
        localStorage.getItem("central_admin_users") || "[]"
      );
      const latestAccount = Array.isArray(users)
        ? users.find((user) => user.id === currentUser?.id)
        : null;
      const hasBrandAccess = currentUser?.brands?.includes("adisorn");
      const accountIsActive = latestAccount?.active === true;
      const brandIsCorrect =
        activeBrand === "adisorn" &&
        (currentUser?.role === "ADMIN" || hasBrandAccess);

      if (!loggedIn || !currentUser || !accountIsActive || !brandIsCorrect) {
        sessionStorage.clear();
        window.location.replace("/login");
        return;
      }

      window.setTimeout(() => {
        setIsAuthorized(true);
      }, 0);
    } catch (error) {
      console.error("Cannot verify Adisorn access", error);
      sessionStorage.clear();
      window.location.replace("/login");
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    try {
      const savedArchives = JSON.parse(
        localStorage.getItem(ARCHIVES_KEY) || "[]"
      );
      const normalizedArchives = Array.isArray(savedArchives)
        ? savedArchives
        : [];
      window.setTimeout(() => {
        setArchives(normalizedArchives);
      }, 0);
    } catch (error) {
      console.error("Cannot load archives", error);
      window.setTimeout(() => {
        setArchives([]);
      }, 0);
    }
  }, [isAuthorized]);

  const moveToTrash = (customer) => {
    const confirmed = window.confirm(
      `ต้องการย้ายใบจอง ${customer.bookingNumber || "นี้"} ไปถังขยะหรือไม่?`
    );

    if (!confirmed) return;

    try {
      const archivesRaw = localStorage.getItem("adisorn_archives") || "[]";
      const trashRaw = localStorage.getItem("adisorn_trash") || "[]";

      const archivesArr = JSON.parse(archivesRaw);
      const trashArr = JSON.parse(trashRaw);

      const archives = Array.isArray(archivesArr) ? archivesArr : [];
      const trash = Array.isArray(trashArr) ? trashArr : [];

      const newArchives = archives.filter(
        (item) => item.bookingNumber !== customer.bookingNumber
      );

      const deletedAt = new Date();
      const trashRecord = {
        ...customer,
        deletedAt: deletedAt.toISOString(),
        deletedDate: deletedAt.toLocaleString("th-TH"),
      };

      trash.unshift(trashRecord);

      localStorage.setItem("adisorn_archives", JSON.stringify(newArchives));
      localStorage.setItem("adisorn_trash", JSON.stringify(trash));

      setArchives(newArchives);

      alert("ย้ายข้อมูลไปถังขยะเรียบร้อย");
    } catch (error) {
      console.error("Failed to move to trash", error);
      alert("ไม่สามารถย้ายข้อมูลไปถังขยะได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">ถังเก็บใบจอง</h1>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/adisorn")}
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
            >
              ระบบสร้างใบจอง
            </button>

            <button
              type="button"
              onClick={() => router.push("/adisorn/dashboard")}
              className="min-h-12 rounded-xl px-5 py-3 font-semibold text-white transition"
              style={brandChrome.primaryButton}
            >
              กลับสู่หน้าหลัก
            </button>
          </div>
        </div>

        <table className="w-full table-auto border-collapse border border-zinc-300 bg-white shadow-sm">
          <thead>
            <tr style={brandChrome.tableHeader}>
              <th className="border border-zinc-300 px-4 py-2">เลขที่จอง</th>
              <th className="border border-zinc-300 px-4 py-2">ชื่อลูกค้า</th>
              <th className="border border-zinc-300 px-4 py-2">วันที่งาน</th>
              <th className="border border-zinc-300 px-4 py-2">สถานที่</th>
              <th className="border border-zinc-300 px-4 py-2">สถานะ</th>
              <th className="border border-zinc-300 px-4 py-2">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {archives.length > 0 ? (
              archives.map((item, index) => (
                <tr key={item.bookingNumber || index} className="border border-zinc-300">
                  <td className="border border-zinc-300 px-4 py-2">{item.bookingNumber || "-"}</td>
                  <td className="border border-zinc-300 px-4 py-2">{item.customerName || "-"}</td>
                  <td className="border border-zinc-300 px-4 py-2">
                    {new Date(item.eventDate).toLocaleDateString("th-TH")}
                  </td>
                  <td className="border border-zinc-300 px-4 py-2">{item.location || "-"}</td>
                  <td className="border border-zinc-300 px-4 py-2">{item.status || "-"}</td>
                  <td className="border border-zinc-300 px-4 py-2 space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.setItem(
                          "adisorn_selectedBooking",
                          JSON.stringify(item)
                        );
                        localStorage.setItem(
                          "adisorn_currentBooking",
                          JSON.stringify(item)
                        );
                        router.push("/adisorn?view=customer", { scroll: false });
                      }}
                      className="min-h-10 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                    >
                      ดูใบจอง
                    </button>

                    <button
                      type="button"
                      onClick={() => moveToTrash(item)}
                      className="rounded-xl border border-red-600 bg-red-50 px-4 py-2 font-semibold text-red-600 hover:bg-red-100"
                    >
                      ย้ายไปถังขยะ
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        // Restore function (not changed)
                      }}
                      className="rounded-xl border border-green-600 bg-green-50 px-4 py-2 font-semibold text-green-600 hover:bg-green-100"
                    >
                      คืนข้อมูล
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="p-8 text-center text-zinc-500">
                  ไม่มีข้อมูลในถังเก็บใบจอง
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

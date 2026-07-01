"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const BRAND_ID = "adisorn";
const TRASH_KEY = "adisorn_trash";
const MAIL_TRASH_KEY = "adisorn_mail_trash";

const normalizeBookingRow = (row) => {
  const bookingData = row?.booking_data || {};

  return {
    ...bookingData,
    supabaseId: row.id,
    brandId: bookingData.brandId || "",
    bookingNumber: bookingData.bookingNumber || row.booking_number || "",
    customerName: bookingData.customerName || row.customer_name || "",
    phone: bookingData.phone || row.phone || "",
    email: bookingData.email || row.email || "",
    service: bookingData.service || row.service || "",
    location: bookingData.location || row.location || "",
    eventDate: bookingData.eventDate || row.event_date || "",
    jobStatus: row.job_status || bookingData.jobStatus || "รอยืนยัน",
    status: row.job_status || bookingData.status || bookingData.jobStatus || "รอยืนยัน",
  };
};

const getBookingData = (booking, updates = {}) => {
  const { supabaseId, ...bookingData } = booking;
  return { ...bookingData, ...updates, brandId: BRAND_ID };
};

export default function TrashPage() {
  const router = useRouter();

  const [trash, setTrash] = useState([]);
  const [mailTrash, setMailTrash] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadTrashData = async () => {
      try {
        const { data, error } = await supabase
          .from("bookings")
          .select("*")
          .eq("deleted", true)
          .order("booking_number", { ascending: false });

        if (error) throw error;

        const deletedBookings = (Array.isArray(data) ? data : [])
          .map(normalizeBookingRow)
          .filter((item) => item.brandId === BRAND_ID);

        localStorage.setItem(TRASH_KEY, JSON.stringify(deletedBookings));
        setTrash(deletedBookings);
      } catch (error) {
        console.error("Cannot load trash data", error);
        const savedTrash = JSON.parse(
          localStorage.getItem(TRASH_KEY) || "[]"
        );
        setTrash(Array.isArray(savedTrash) ? savedTrash : []);
      }
    };

    const handleTrashStorage = (event) => {
      if (event.key === TRASH_KEY) {
        loadTrashData();
      }
    };

    const handlePageVisible = () => {
      if (document.visibilityState === "visible") {
        loadTrashData();
      }
    };

    const bookingsChannel = supabase
      .channel(`${BRAND_ID}-trash-bookings`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        loadTrashData
      )
      .subscribe();

    loadTrashData();
    window.addEventListener("focus", loadTrashData);
    window.addEventListener("pageshow", loadTrashData);
    window.addEventListener("storage", handleTrashStorage);
    document.addEventListener("visibilitychange", handlePageVisible);

    return () => {
      window.removeEventListener("focus", loadTrashData);
      window.removeEventListener("pageshow", loadTrashData);
      window.removeEventListener("storage", handleTrashStorage);
      document.removeEventListener("visibilitychange", handlePageVisible);
      supabase.removeChannel(bookingsChannel);
    };
  }, []);

  useEffect(() => {
    const loadMailTrashData = () => {
      try {
        const savedMailTrash = JSON.parse(
          localStorage.getItem(MAIL_TRASH_KEY) || "[]"
        );
        setMailTrash(Array.isArray(savedMailTrash) ? savedMailTrash : []);
      } catch {
        setMailTrash([]);
      }
    };

    const handleMailTrashStorage = (event) => {
      if (event.key === MAIL_TRASH_KEY) {
        loadMailTrashData();
      }
    };

    loadMailTrashData();
    window.addEventListener("focus", loadMailTrashData);
    window.addEventListener("pageshow", loadMailTrashData);
    window.addEventListener("storage", handleMailTrashStorage);

    return () => {
      window.removeEventListener("focus", loadMailTrashData);
      window.removeEventListener("pageshow", loadMailTrashData);
      window.removeEventListener("storage", handleMailTrashStorage);
    };
  }, []);

  const restoreCustomer = async (originalIndex) => {
    const customer = trash[originalIndex];
    if (!customer) return;

    const restoreToArchives =
      customer.deletedFrom === "archives" ||
      (!customer.deletedFrom &&
        Boolean(
          customer.archivedAt ||
            customer.archiveDate ||
            customer.archivedDate ||
            customer.movedToArchiveAt
        ));

    const {
      deletedAt,
      deletedDate,
      deletedFrom,
      ...restoredCustomer
    } = customer;

    const restoredRecord = restoreToArchives
      ? { ...restoredCustomer, restoredAt: new Date().toISOString() }
      : {
          ...restoredCustomer,
          jobStatus: customer.jobStatus || "รอยืนยัน",
          restoredAt: new Date().toISOString(),
        };

    if (customer.supabaseId) {
      const { error } = await supabase
        .from("bookings")
        .update({
          archived: restoreToArchives,
          deleted: false,
          booking_data: getBookingData(restoredRecord),
        })
        .eq("id", customer.supabaseId);

      if (error) {
        console.error("Cannot restore booking", error);
        alert("กู้คืนข้อมูลไม่สำเร็จ");
        return;
      }
    }

    const updatedTrash = trash.filter(
      (_, index) => index !== originalIndex
    );

    localStorage.setItem(
      TRASH_KEY,
      JSON.stringify(updatedTrash)
    );

    setTrash(updatedTrash);

    alert(
      restoreToArchives
        ? "กู้คืนข้อมูลกลับคลังข้อมูลเรียบร้อย"
        : "กู้คืนข้อมูลกลับหน้าข้อมูลลูกค้าเรียบร้อย"
    );
  };

  const deleteForever = async (originalIndex) => {
    if (!window.confirm("ยืนยันการลบถาวร ?")) return;

    const customer = trash[originalIndex];
    if (customer?.supabaseId || customer?.bookingNumber) {
      let deletedRows = [];
      let deleteError = null;

      if (customer.supabaseId) {
        const { data, error } = await supabase
          .from("bookings")
          .delete()
          .eq("id", customer.supabaseId)
          .select("id");

        deletedRows = Array.isArray(data) ? data : [];
        deleteError = error;
      }

      if (
        !deleteError &&
        deletedRows.length === 0 &&
        customer.bookingNumber
      ) {
        const { data, error } = await supabase
          .from("bookings")
          .delete()
          .eq("booking_number", customer.bookingNumber)
          .eq("deleted", true)
          .select("id");

        deletedRows = Array.isArray(data) ? data : [];
        deleteError = error;
      }

      if (deleteError || deletedRows.length === 0) {
        console.error("Cannot delete booking forever", deleteError);
        alert("ลบถาวรไม่สำเร็จ กรุณาตรวจสอบ DELETE policy ใน Supabase");
        return;
      }
    } else {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("deleted", true);

      if (error) {
        console.error("Cannot delete booking forever", error);
        alert("ลบถาวรไม่สำเร็จ");
        return;
      }
    }

    const updatedTrash = trash.filter(
      (_, index) => index !== originalIndex
    );

    localStorage.setItem(
      TRASH_KEY,
      JSON.stringify(updatedTrash)
    );
    setTrash(updatedTrash);

    alert("ลบถาวรเรียบร้อย");
  };

  const clearTrash = async () => {
    if (!window.confirm("ยืนยันการลบข้อมูลทั้งหมดในถังขยะ ?")) return;

    const { data, error } = await supabase
      .from("bookings")
      .delete()
      .eq("deleted", true)
      .select("id");

    if (
      error ||
      (trash.length > 0 && (!Array.isArray(data) || data.length === 0))
    ) {
      console.error("Cannot clear trash", error);
      alert("ล้างถังขยะไม่สำเร็จ กรุณาตรวจสอบ DELETE policy ใน Supabase");
      return;
    }

    localStorage.setItem(TRASH_KEY, "[]");
    setTrash([]);

    alert("ล้างถังขยะเรียบร้อย");
  };

  const restoreMailTrash = (originalIndex) => {
    const updatedMailTrash = mailTrash.filter(
      (_, index) => index !== originalIndex
    );
    localStorage.setItem(MAIL_TRASH_KEY, JSON.stringify(updatedMailTrash));
    setMailTrash(updatedMailTrash);
    alert("กู้คืนอีเมลกลับหน้าเมลเรียบร้อย");
  };

  const deleteMailTrashForever = (originalIndex) => {
    if (!window.confirm("ยืนยันการลบอีเมลนี้ออกจากขยะเมลถาวร ?")) return;

    const updatedMailTrash = mailTrash.filter(
      (_, index) => index !== originalIndex
    );
    localStorage.setItem(MAIL_TRASH_KEY, JSON.stringify(updatedMailTrash));
    setMailTrash(updatedMailTrash);
    alert("ลบอีเมลออกจากขยะเมลถาวรเรียบร้อย");
  };

  const clearMailTrash = () => {
    if (!window.confirm("ยืนยันการล้างขยะเมลทั้งหมด ?")) return;

    localStorage.setItem(MAIL_TRASH_KEY, "[]");
    setMailTrash([]);
    alert("ล้างขยะเมลเรียบร้อย");
  };

  const filteredTrash = trash
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => {
      const keyword = search.trim().toLowerCase();

      return (
        !keyword ||
        String(item.bookingNumber || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.customerName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.phone || "")
          .toLowerCase()
          .includes(keyword)
      );
    });

  const filteredMailTrash = mailTrash
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => {
      const keyword = search.trim().toLowerCase();

      return (
        !keyword ||
        String(item.bookingNumber || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.customerName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item.email || "")
          .toLowerCase()
          .includes(keyword)
      );
    });

  return (
    <main className="min-h-screen bg-zinc-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">🗑️ ถังขยะ</h1>
            <p className="mt-2 text-zinc-500">
              รายการที่ถูกลบและสามารถกู้คืนได้
            </p>
          </div>

          <div className="flex flex-wrap gap-3">

            <button
              type="button"
              onClick={clearTrash}
              disabled={trash.length === 0}
              className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ล้างถังขยะทั้งหมด
            </button>

            <button
              type="button"
              onClick={clearMailTrash}
              disabled={mailTrash.length === 0}
              className="rounded-xl border border-red-200 bg-white px-5 py-3 font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ล้างขยะเมล
            </button>

            <button
              type="button"
              onClick={() => router.push("/adisorn/dashboard")}
              className="rounded-xl bg-black px-5 py-3 font-semibold text-white hover:bg-zinc-800"
            >
              เมนูหลัก
            </button>
          </div>
        </div>

        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหาเลขที่จอง ชื่อลูกค้า หรือเบอร์โทร"
          className="mb-6 w-full rounded-xl border border-zinc-300 bg-white p-4"
        />

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-lg font-semibold">
              ถังขยะใบจอง {trash.length} รายการ
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-lg font-semibold">
              ขยะเมล {mailTrash.length} รายการ
            </p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-lg font-semibold">ถังขยะใบจอง</p>
        </div>

        <div className="space-y-4">
          {filteredTrash.length > 0 ? (
            filteredTrash.map(({ item, originalIndex }) => (
              <div
                key={`${item.bookingNumber || "trash"}-${originalIndex}`}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <div className="grid gap-2 text-zinc-700 md:grid-cols-2">
                  <p>
                    <strong>เลขที่จอง:</strong> {item.bookingNumber || "-"}
                  </p>
                  <p>
                    <strong>ชื่อลูกค้า:</strong> {item.customerName || "-"}
                  </p>
                  <p>
                    <strong>เบอร์โทร:</strong> {item.phone || "-"}
                  </p>
                  <p>
                    <strong>ประเภทงาน:</strong> {item.service || "-"}
                  </p>
                  <p>
                    <strong>วันที่ลบ:</strong>{" "}
                    {item.deletedDate || item.deletedAt || "-"}
                  </p>
                  <p>
                    <strong>กู้คืนไปยัง:</strong>{" "}
                    {item.deletedFrom === "archives" ||
                    (!item.deletedFrom &&
                      (item.archivedAt ||
                        item.archiveDate ||
                        item.archivedDate ||
                        item.movedToArchiveAt))
                      ? "คลังข้อมูล"
                      : "ข้อมูลลูกค้า"}
                  </p>
                  <p>
                    <strong>สถานะงาน:</strong>{" "}
                    {item.jobStatus || "รอยืนยัน"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => restoreCustomer(originalIndex)}
                    className="rounded-xl bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
                  >
                    ♻️ กู้คืน
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteForever(originalIndex)}
                    className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
                  >
                    ❌ ลบถาวร
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-white p-10 text-center text-zinc-500 shadow-sm">
              ไม่พบรายการในถังขยะ
            </div>
          )}
        </div>

        <div className="mt-10 mb-4">
          <p className="text-lg font-semibold">ขยะเมล</p>
        </div>

        <div className="space-y-4">
          {filteredMailTrash.length > 0 ? (
            filteredMailTrash.map(({ item, originalIndex }) => (
              <div
                key={`${item.bookingNumber || item.email || "mail-trash"}-${originalIndex}`}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <div className="grid gap-2 text-zinc-700 md:grid-cols-2">
                  <p>
                    <strong>เลขที่จอง:</strong> {item.bookingNumber || "-"}
                  </p>
                  <p>
                    <strong>ชื่อลูกค้า:</strong> {item.customerName || "-"}
                  </p>
                  <p>
                    <strong>อีเมล:</strong> {item.email || "-"}
                  </p>
                  <p>
                    <strong>วันที่ลบ:</strong>{" "}
                    {item.deletedDate || item.deletedAt || "-"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => restoreMailTrash(originalIndex)}
                    className="rounded-xl bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
                  >
                    กู้คืนเมล
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteMailTrashForever(originalIndex)}
                    className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
                  >
                    ลบถาวร
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-white p-10 text-center text-zinc-500 shadow-sm">
              ไม่พบรายการในขยะเมล
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const BRAND_ID = "adisorn";
const ARCHIVES_KEY = "adisorn_archives";
const PAYMENT_RECEIPTS_KEY = "adisorn_paymentReceipts";
const SELECTED_BOOKING_KEY = "adisorn_selectedBooking";
const CURRENT_BOOKING_KEY = "adisorn_currentBooking";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const readArray = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error(`Cannot read ${key}`, error);
    return [];
  }
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatSavedDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

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

export default function ArchivesPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [activeTab, setActiveTab] = useState("bookings");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("bookingNumber");
  const [sortDirection, setSortDirection] = useState("desc");
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const verifyAccess = () => {
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
        const isAdmin = currentUser?.role === "ADMIN";
        const hasBrandAccess = currentUser?.brands?.includes("adisorn");
        const accountIsActive = latestAccount?.active === true;
        const brandIsCorrect =
          activeBrand === "adisorn" && (isAdmin || hasBrandAccess);
        const lastActivity = Number(
          sessionStorage.getItem("lastActivity") || Date.now()
        );
        const sessionExpired = Date.now() - lastActivity > SESSION_TIMEOUT_MS;

        if (
          !loggedIn ||
          !currentUser ||
          !accountIsActive ||
          !brandIsCorrect ||
          sessionExpired
        ) {
          sessionStorage.clear();
          window.location.replace("/login");
          return false;
        }

        sessionStorage.setItem("lastActivity", String(Date.now()));
        setIsAuthorized(true);
        return true;
      } catch (error) {
        console.error("Cannot verify Adisorn access", error);
        sessionStorage.clear();
        window.location.replace("/login");
        return false;
      }
    };

    if (!verifyAccess()) return;

    let activityTimer;

    const updateActivity = () => {
      window.clearTimeout(activityTimer);
      activityTimer = window.setTimeout(() => {
        sessionStorage.setItem("lastActivity", String(Date.now()));
      }, 500);
    };

    const handleStorage = (event) => {
      if (event.key === "central_admin_users") {
        verifyAccess();
      }
    };

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearInterval(sessionCheck);
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const loadArchives = async () => {
    let bookingItems = [];

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("archived", true)
        .eq("deleted", false)
        .order("booking_number", { ascending: false });

      if (error) throw error;

      bookingItems = (Array.isArray(data) ? data : [])
        .map(normalizeBookingRow)
        .filter((item) => item.brandId === BRAND_ID);
    } catch (error) {
      console.error("Cannot load archived bookings from Supabase", error);
      bookingItems = readArray(ARCHIVES_KEY).filter(
        (item) => item?.archiveType !== "payment-receipt"
      );
    }

    const savedArchives = readArray(ARCHIVES_KEY);
    const savedReceipts = readArray(PAYMENT_RECEIPTS_KEY);

    const receiptMap = new Map();

    [...savedArchives, ...savedReceipts]
      .filter(
        (item) =>
          item?.archiveType === "payment-receipt" || item?.receiptNumber
      )
      .forEach((item) => {
        const key = item.receiptNumber || item.id;
        if (!key) return;

        const existingItem = receiptMap.get(key);
        const preferredItem =
          item.receiptHtml || !existingItem?.receiptHtml
            ? item
            : existingItem;

        receiptMap.set(key, {
          ...existingItem,
          ...preferredItem,
          receiptHtml:
            preferredItem.receiptHtml || existingItem?.receiptHtml || "",
          archiveType: "payment-receipt",
          category: "ใบรับชำระเงิน",
        });
      });

    setBookings(bookingItems);
    setReceipts(
      Array.from(receiptMap.values()).sort(
        (a, b) =>
          new Date(b.savedAt || 0).getTime() -
          new Date(a.savedAt || 0).getTime()
      )
    );
  };

  useEffect(() => {
    if (!isAuthorized) return;

    const timer = window.setTimeout(loadArchives, 0);

    const handleStorage = (event) => {
      if (
        !event.key ||
        event.key === ARCHIVES_KEY ||
        event.key === PAYMENT_RECEIPTS_KEY
      ) {
        loadArchives();
      }
    };

    const handlePageVisible = () => {
      if (document.visibilityState === "visible") {
        loadArchives();
      }
    };

    const bookingsChannel = supabase
      .channel(`${BRAND_ID}-archives-bookings`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        loadArchives
      )
      .subscribe();

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", loadArchives);
    window.addEventListener("pageshow", loadArchives);
    document.addEventListener("visibilitychange", handlePageVisible);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", loadArchives);
      window.removeEventListener("pageshow", loadArchives);
      document.removeEventListener("visibilitychange", handlePageVisible);
      supabase.removeChannel(bookingsChannel);
    };
  }, [isAuthorized]);

  const filteredBookings = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const matchedItems = !keyword
      ? [...bookings]
      : bookings.filter((item) =>
          [
            item.bookingNumber,
            item.customerName,
            item.phone,
            item.service,
            item.location,
            item.jobStatus,
            item.status,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(keyword)
            )
        );

    return matchedItems.sort((a, b) => {
      let firstValue = "";
      let secondValue = "";

      if (sortBy === "customerName") {
        firstValue = String(a.customerName || "");
        secondValue = String(b.customerName || "");
      } else if (sortBy === "jobStatus") {
        firstValue = String(a.jobStatus || a.status || "รอดำเนินการ");
        secondValue = String(b.jobStatus || b.status || "รอดำเนินการ");
      } else if (sortBy === "eventDate") {
        firstValue = new Date(a.eventDate || 0).getTime();
        secondValue = new Date(b.eventDate || 0).getTime();
      } else {
        firstValue = String(a.bookingNumber || "");
        secondValue = String(b.bookingNumber || "");
      }

      if (typeof firstValue === "number" && typeof secondValue === "number") {
        return sortDirection === "asc"
          ? firstValue - secondValue
          : secondValue - firstValue;
      }

      return sortDirection === "asc"
        ? firstValue.localeCompare(secondValue, "th")
        : secondValue.localeCompare(firstValue, "th");
    });
  }, [bookings, search, sortBy, sortDirection]);

  const filteredReceipts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return receipts.filter((item) => {
      if (!keyword) return true;

      return [
        item.receiptNumber,
        item.bookingNumber,
        item.customerName,
        item.phone,
        item.email,
        item.paymentMethod,
        item.paymentStatus,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [receipts, search]);

  const saveBookings = (items) => {
    const receiptItems = readArray(ARCHIVES_KEY).filter(
      (item) => item?.archiveType === "payment-receipt"
    );
    localStorage.setItem(
      ARCHIVES_KEY,
      JSON.stringify([...items, ...receiptItems])
    );
    setBookings(items);
  };

  const openBooking = (booking) => {
    localStorage.setItem(SELECTED_BOOKING_KEY, JSON.stringify(booking));
    localStorage.setItem(CURRENT_BOOKING_KEY, JSON.stringify(booking));
    router.push("/adisorn?view=customer", { scroll: false });
  };

  const restoreBooking = async (booking) => {
    const remainingBookings = bookings.filter(
      (item) => item.bookingNumber !== booking.bookingNumber
    );
    const restoredAt = new Date().toISOString();

    if (booking.supabaseId) {
      const { error } = await supabase
        .from("bookings")
        .update({
          archived: false,
          deleted: false,
          booking_data: getBookingData(booking, { restoredAt }),
        })
        .eq("id", booking.supabaseId);

      if (error) {
        console.error("Cannot restore archived booking", error);
        window.alert("กู้คืนข้อมูลไม่สำเร็จ");
        return;
      }
    }

    saveBookings(remainingBookings);
  };

  const moveToTrash = async (booking) => {
    const confirmed = window.confirm(
      `ต้องการย้ายใบจอง ${booking.bookingNumber || "นี้"} ไปถังขยะหรือไม่?`
    );

    if (!confirmed) return;

    const remainingBookings = bookings.filter(
      (item) => item.bookingNumber !== booking.bookingNumber
    );
    const deletedAt = new Date();
    const trashRecord = {
      ...booking,
      deletedFrom: "archives",
      deletedAt: deletedAt.toISOString(),
      deletedDate: deletedAt.toLocaleString("th-TH"),
    };

    if (booking.supabaseId) {
      const { error } = await supabase
        .from("bookings")
        .update({
          archived: false,
          deleted: true,
          booking_data: getBookingData(trashRecord),
        })
        .eq("id", booking.supabaseId);

      if (error) {
        console.error("Cannot move archived booking to trash", error);
        window.alert("ย้ายข้อมูลไปถังขยะไม่สำเร็จ");
        return;
      }
    }

    saveBookings(remainingBookings);
    window.alert("ย้ายข้อมูลไปถังขยะเรียบร้อย");
  };

  const deleteReceipt = (receipt) => {
    const confirmed = window.confirm(
      `ต้องการลบใบรับชำระ ${receipt.receiptNumber || "นี้"} หรือไม่?`
    );

    if (!confirmed) return;

    const nextReceipts = readArray(PAYMENT_RECEIPTS_KEY).filter(
      (item) => item.receiptNumber !== receipt.receiptNumber
    );
    const nextArchives = readArray(ARCHIVES_KEY).filter(
      (item) =>
        !(
          item?.archiveType === "payment-receipt" &&
          item?.receiptNumber === receipt.receiptNumber
        )
    );

    localStorage.setItem(PAYMENT_RECEIPTS_KEY, JSON.stringify(nextReceipts));
    localStorage.setItem(ARCHIVES_KEY, JSON.stringify(nextArchives));
    setSelectedReceipt(null);
    loadArchives();
  };

  const downloadReceipt = (receipt) => {
    const printWindow = window.open("", "_blank", "width=900,height=1100");

    if (!printWindow) {
      window.alert("กรุณาอนุญาต Pop-up แล้วลองใหม่อีกครั้ง");
      return;
    }

    if (receipt.receiptHtml) {
      printWindow.document.open();
      printWindow.document.write(receipt.receiptHtml);
      printWindow.document.close();

      printWindow.addEventListener("load", async () => {
        try {
          if (printWindow.document.fonts?.ready) {
            await printWindow.document.fonts.ready;
          }

          const images = Array.from(printWindow.document.images);
          await Promise.all(
            images.map(
              (image) =>
                new Promise((resolve) => {
                  if (image.complete) {
                    resolve();
                    return;
                  }

                  image.addEventListener("load", resolve, { once: true });
                  image.addEventListener("error", resolve, { once: true });
                })
            )
          );
        } catch (error) {
          console.error("Cannot finish loading receipt assets", error);
        }

        const previewStyle = printWindow.document.createElement("style");
        previewStyle.textContent = [
          ".archive-preview-actions {",
          "  position: fixed;",
          "  right: 24px;",
          "  bottom: 24px;",
          "  z-index: 9999;",
          "  display: flex;",
          "  gap: 10px;",
          "}",
          ".archive-preview-actions button {",
          "  border: 0;",
          "  border-radius: 14px;",
          "  padding: 12px 18px;",
          "  font-family: inherit;",
          "  font-size: 14px;",
          "  font-weight: 800;",
          "  cursor: pointer;",
          "  box-shadow: 0 10px 30px rgba(24, 24, 27, 0.18);",
          "}",
          ".archive-preview-actions .back-button {",
          "  border: 1px solid #d4d4d8;",
          "  background: #ffffff;",
          "  color: #3f3f46;",
          "}",
          ".archive-preview-actions .download-button {",
          "  background: #18181b;",
          "  color: #ffffff;",
          "}",
          // Inserted styles for download menu before @media print
          ".archive-download-wrap { position: relative; }",
          ".archive-download-menu {",
          "  position: absolute;",
          "  right: 0;",
          "  bottom: calc(100% + 10px);",
          "  display: none;",
          "  min-width: 140px;",
          "  overflow: hidden;",
          "  border: 1px solid #d4d4d8;",
          "  border-radius: 14px;",
          "  background: #ffffff;",
          "  box-shadow: 0 14px 35px rgba(24, 24, 27, 0.18);",
          "}",
          ".archive-download-menu.show { display: block; }",
          ".archive-download-menu button {",
          "  display: block;",
          "  width: 100%;",
          "  border-radius: 0;",
          "  background: #ffffff;",
          "  color: #18181b;",
          "  text-align: left;",
          "  box-shadow: none;",
          "}",
          ".archive-download-menu button:hover { background: #f4f4f5; }",
          "@media print {",
          "  .archive-preview-actions { display: none !important; }",
          "}",
        ].join("\n");

        const actions = printWindow.document.createElement("div");
        actions.className = "archive-preview-actions";
        actions.innerHTML =
          '<button type="button" class="back-button">ย้อนกลับ</button>' +
          '<div class="archive-download-wrap">' +
          '<button type="button" class="download-button">ดาวน์โหลด</button>' +
          '<div class="archive-download-menu">' +
          '<button type="button" class="pdf-button">PDF</button>' +
          '<button type="button" class="jpg-button">JPG</button>' +
          '</div>' +
          '</div>';

        printWindow.document.head.appendChild(previewStyle);
        printWindow.document.body.appendChild(actions);

        actions
          .querySelector(".back-button")
          .addEventListener("click", () => printWindow.close());
        const downloadMenu = actions.querySelector(".archive-download-menu");
        actions
          .querySelector(".download-button")
          .addEventListener("click", () => downloadMenu.classList.toggle("show"));
        actions
          .querySelector(".pdf-button")
          .addEventListener("click", () => {
            downloadMenu.classList.remove("show");
            printWindow.print();
          });
        actions
          .querySelector(".jpg-button")
          .addEventListener("click", async () => {
            downloadMenu.classList.remove("show");

            try {
              if (!printWindow.html2canvas) {
                await new Promise((resolve, reject) => {
                  const script = printWindow.document.createElement("script");
                  script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
                  script.onload = resolve;
                  script.onerror = reject;
                  printWindow.document.head.appendChild(script);
                });
              }

              const page = printWindow.document.querySelector(".page");
              if (!page) throw new Error("ไม่พบหน้าเอกสาร");

              const canvas = await printWindow.html2canvas(page, {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                logging: false,
              });
              const link = printWindow.document.createElement("a");
              link.download = (receipt.receiptNumber || "payment-receipt") + ".jpg";
              link.href = canvas.toDataURL("image/jpeg", 0.95);
              link.click();
            } catch (error) {
              console.error("Cannot download receipt JPG", error);
              printWindow.alert("ไม่สามารถสร้างไฟล์ JPG ได้ กรุณาลองใหม่อีกครั้ง");
            }
          });
      });
      return;
    }

    const paymentDate = receipt.paymentDateText || "-";
    const savedDate = formatSavedDate(receipt.savedAt);

    printWindow.document.write(`
      <!doctype html>
      <html lang="th">
        <head>
          <meta charset="utf-8" />
          <title>${receipt.receiptNumber || "payment-receipt"}</title>
          <style>
            @page { size: A4; margin: 18mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #18181b;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .header {
              display: flex;
              justify-content: space-between;
              gap: 24px;
              padding-bottom: 18px;
              border-bottom: 2px solid #18181b;
            }
            h1, h2, h3, p { margin: 0; }
            .muted { color: #71717a; }
            .title { margin: 26px 0; text-align: center; }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
            }
            .card {
              border: 1px solid #d4d4d8;
              border-radius: 14px;
              padding: 16px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              padding: 8px 0;
              border-bottom: 1px solid #e4e4e7;
            }
            .row:last-child { border-bottom: 0; }
            .summary {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              margin-top: 20px;
              border: 1px solid #18181b;
              border-radius: 14px;
              overflow: hidden;
            }
            .summary div {
              padding: 14px;
              text-align: center;
              border-right: 1px solid #d4d4d8;
            }
            .summary div:last-child { border-right: 0; }
            .summary strong { display: block; margin-top: 6px; }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
              margin-top: 90px;
            }
            .signature {
              min-height: 110px;
              padding: 16px;
              border: 1px solid #18181b;
              border-radius: 14px;
              text-align: center;
            }
            .line {
              width: 70%;
              margin: 34px auto 10px;
              border-top: 1px solid #18181b;
            }
            .archive-preview-actions {
              position: fixed;
              right: 24px;
              bottom: 24px;
              z-index: 9999;
              display: flex;
              gap: 10px;
            }
            .archive-preview-actions button {
              border: 0;
              border-radius: 14px;
              padding: 12px 18px;
              font-family: inherit;
              font-size: 14px;
              font-weight: 800;
              cursor: pointer;
              box-shadow: 0 10px 30px rgba(24, 24, 27, 0.18);
            }
            .archive-preview-actions .back-button {
              border: 1px solid #d4d4d8;
              background: #ffffff;
              color: #3f3f46;
            }
            .archive-preview-actions .download-button {
              background: #18181b;
              color: #ffffff;
            }
            .archive-download-wrap { position: relative; }
            .archive-download-menu {
              position: absolute;
              right: 0;
              bottom: calc(100% + 10px);
              display: none;
              min-width: 140px;
              overflow: hidden;
              border: 1px solid #d4d4d8;
              border-radius: 14px;
              background: #ffffff;
              box-shadow: 0 14px 35px rgba(24, 24, 27, 0.18);
            }
            .archive-download-menu.show { display: block; }
            .archive-download-menu button {
              display: block;
              width: 100%;
              border-radius: 0;
              background: #ffffff;
              color: #18181b;
              text-align: left;
              box-shadow: none;
            }
            @media print {
              .archive-preview-actions { display: none !important; }
            }
          </style>
        </head>
        <body>
          <header class="header">
            <div>
              <h2>Adisorn Wedding Studio</h2>
              <p class="muted">adisornweddingstudio@gmail.com</p>
              <p class="muted">โทร. 082 141 9633</p>
            </div>
            <div style="text-align:right">
              <h3>ใบรับชำระเงินรายงวด</h3>
              <p><strong>${receipt.receiptNumber || "-"}</strong></p>
              <p class="muted">อ้างอิง ${receipt.bookingNumber || "-"}</p>
            </div>
          </header>

          <div class="title">
            <h1>ใบรับชำระเงิน งวดที่ ${receipt.installmentNumber || "-"}</h1>
            <p class="muted">บันทึกเมื่อ ${savedDate}</p>
          </div>

          <section class="grid">
            <div class="card">
              <h3>ข้อมูลลูกค้า</h3>
              <div class="row"><span>ชื่อลูกค้า</span><strong>${receipt.customerName || "-"}</strong></div>
              <div class="row"><span>เบอร์โทรศัพท์</span><strong>${receipt.phone || "-"}</strong></div>
              <div class="row"><span>อีเมล</span><strong>${receipt.email || "-"}</strong></div>
            </div>
            <div class="card">
              <h3>รายละเอียดการชำระ</h3>
              <div class="row"><span>วันที่ชำระ</span><strong>${paymentDate}</strong></div>
              <div class="row"><span>วิธีชำระ</span><strong>${receipt.paymentMethod || "-"}</strong></div>
              <div class="row"><span>สถานะ</span><strong>${receipt.paymentStatus || "-"}</strong></div>
            </div>
          </section>

          <section class="summary">
            <div><span>ยอดสุทธิ</span><strong>฿ ${formatMoney(receipt.finalPrice)}</strong></div>
            <div><span>ชำระงวดนี้</span><strong>฿ ${formatMoney(receipt.installmentAmount)}</strong></div>
            <div><span>ยอดชำระสะสม</span><strong>฿ ${formatMoney(receipt.cumulativePaid)}</strong></div>
            <div><span>ยอดคงเหลือ</span><strong>฿ ${formatMoney(receipt.remainingAmount)}</strong></div>
          </section>

          <section class="signatures">
            <div class="signature">
              <strong>ลูกค้า</strong>
              <div class="line"></div>
              <p class="muted">วันที่ ........../........../..........</p>
            </div>
            <div class="signature">
              <strong>Adisorn Wedding Studio</strong>
              <div class="line"></div>
              <p class="muted">ผู้รับชำระเงิน</p>
            </div>
          </section>

          <div class="archive-preview-actions">
            <button
              type="button"
              class="back-button"
              onclick="window.close()"
            >
              ย้อนกลับ
            </button>
            <div class="archive-download-wrap">
              <button
                type="button"
                class="download-button"
                onclick="document.getElementById('archive-download-menu').classList.toggle('show')"
              >
                ดาวน์โหลด
              </button>
              <div id="archive-download-menu" class="archive-download-menu">
                <button type="button" onclick="window.print()">PDF</button>
                <button type="button" onclick="downloadFallbackJPG()">JPG</button>
              </div>
            </div>
          </div>
          <script>
            const downloadFallbackJPG = async () => {
              try {
                if (!window.html2canvas) {
                  await new Promise((resolve, reject) => {
                    const script = document.createElement("script");
                    script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                  });
                }

                const canvas = await window.html2canvas(document.body, {
                  scale: 2,
                  useCORS: true,
                  backgroundColor: "#ffffff",
                  logging: false,
                });
                const link = document.createElement("a");
                link.download = "payment-receipt.jpg";
                link.href = canvas.toDataURL("image/jpeg", 0.95);
                link.click();
              } catch (error) {
                console.error("Cannot download receipt JPG", error);
                window.alert("ไม่สามารถสร้างไฟล์ JPG ได้ กรุณาลองใหม่อีกครั้ง");
              }
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const getStatusClassName = (status) => {
    const normalizedStatus = String(status || "").trim();

    if (["เสร็จสิ้น", "ส่งมอบแล้ว", "ปิดงานแล้ว"].includes(normalizedStatus)) {
      return "bg-emerald-100 text-emerald-700";
    }

    if (["กำลังดำเนินการ", "กำลังถ่ายทำ", "กำลังตัดต่อ"].includes(normalizedStatus)) {
      return "bg-blue-100 text-blue-700";
    }

    if (["ยกเลิก", "ยกเลิกงาน"].includes(normalizedStatus)) {
      return "bg-red-100 text-red-700";
    }

    return "bg-amber-100 text-amber-700";
  };

  const currentCount =
    activeTab === "bookings" ? filteredBookings.length : filteredReceipts.length;

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">คลังข้อมูล</h1>
            <p className="mt-1 text-zinc-500">
              ใบจอง {bookings.length} รายการ · ใบรับชำระ {receipts.length} รายการ
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/adisorn/customers")}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold text-zinc-700"
            >
              ข้อมูลลูกค้า
            </button>
            <button
              type="button"
              onClick={() => router.push("/adisorn/dashboard")}
              className="rounded-xl bg-black px-4 py-2 font-semibold text-white"
            >
              เมนูหลัก
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setActiveTab("bookings");
              setSearch("");
            }}
            className={`rounded-xl px-5 py-3 font-semibold transition ${
              activeTab === "bookings"
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            ใบจอง ({bookings.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("receipts");
              setSearch("");
            }}
            className={`rounded-xl px-5 py-3 font-semibold transition ${
              activeTab === "receipts"
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            ใบรับชำระเงิน ({receipts.length})
          </button>
        </div>

        <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 flex-1">
              <label className="mb-2 block text-sm font-semibold text-zinc-700">
                ค้นหาข้อมูล
              </label>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  activeTab === "bookings"
                    ? "ค้นหาเลขที่จอง ชื่อลูกค้า เบอร์โทร ประเภทงาน หรือสถานะงาน"
                    : "ค้นหาเลขใบรับชำระ เลขใบจอง ชื่อลูกค้า หรือวิธีชำระ"
                }
                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none transition focus:border-zinc-900 focus:bg-white"
              />
            </div>

            {activeTab === "bookings" && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="mb-2 text-sm font-semibold text-zinc-700">
                    เรียงตาม
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["bookingNumber", "เลขที่จอง"],
                      ["customerName", "ชื่อลูกค้า"],
                      ["jobStatus", "สถานะงาน"],
                      ["eventDate", "วันที่งาน"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSortBy(value)}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                          sortBy === value
                            ? "bg-zinc-900 text-white shadow-sm"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSortDirection((current) =>
                      current === "asc" ? "desc" : "asc"
                    )
                  }
                  className="h-10 whitespace-nowrap rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  {sortDirection === "asc" ? "↑ น้อยไปมาก" : "↓ มากไปน้อย"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mb-3 text-sm font-semibold text-zinc-500">
          พบ {currentCount} รายการ
        </div>

        {activeTab === "bookings" ? (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <div className="min-w-[1250px]">
              <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr_360px] gap-4 bg-zinc-900 px-5 py-4 text-sm font-semibold tracking-wide text-zinc-100">
                <div>เลขที่การจอง</div>
                <div>ชื่อลูกค้า</div>
                <div>ประเภทงาน</div>
                <div>วันที่งาน</div>
                <div>สถานะงาน</div>
                <div className="text-center">จัดการ</div>
              </div>

              {filteredBookings.length > 0 ? (
                filteredBookings.map((booking, index) => {
                  const jobStatus =
                    booking.jobStatus || booking.status || "รอดำเนินการ";

                  return (
                    <div
                      key={booking.bookingNumber || index}
                      className="grid grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr_360px] items-center gap-4 border-t border-zinc-200 px-5 py-4 transition hover:bg-zinc-50"
                    >
                      <div className="font-semibold">
                        {booking.bookingNumber || "-"}
                      </div>
                      <div>
                        <p className="font-semibold">{booking.customerName || "-"}</p>
                        <p className="text-sm text-zinc-500">{booking.phone || "-"}</p>
                      </div>
                      <div>{booking.service || "-"}</div>
                      <div>
                        {booking.formattedEventDate ||
                          (booking.eventDate
                            ? new Date(booking.eventDate).toLocaleDateString("th-TH")
                            : "-")}
                      </div>
                      <div>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getStatusClassName(
                            jobStatus
                          )}`}
                        >
                          {jobStatus}
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openBooking(booking)}
                          className="rounded-xl bg-blue-600 px-3 py-2 font-semibold text-white"
                        >
                          ดูใบจอง
                        </button>
                        <button
                          type="button"
                          onClick={() => restoreBooking(booking)}
                          className="rounded-xl bg-green-600 px-3 py-2 font-semibold text-white"
                        >
                          คืนข้อมูล
                        </button>
                        <button
                          type="button"
                          onClick={() => moveToTrash(booking)}
                          className="rounded-xl bg-red-600 px-3 py-2 font-semibold text-white"
                        >
                          ย้ายไปถังขยะ
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-10 text-center text-zinc-500">
                  ไม่พบข้อมูลใบจองในคลัง
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <div className="min-w-[1180px]">
              <div className="grid grid-cols-[1.25fr_1fr_0.7fr_0.8fr_0.9fr_320px] gap-4 bg-zinc-900 px-5 py-4 text-sm font-semibold tracking-wide text-zinc-100">
                <div>เลขที่ใบรับชำระ</div>
                <div>ลูกค้า / ใบจอง</div>
                <div>งวดที่</div>
                <div>ยอดชำระ</div>
                <div>วันที่บันทึก</div>
                <div className="text-center">จัดการ</div>
              </div>

              {filteredReceipts.length > 0 ? (
                filteredReceipts.map((receipt, index) => (
                  <div
                    key={receipt.receiptNumber || index}
                    className="grid grid-cols-[1.25fr_1fr_0.7fr_0.8fr_0.9fr_320px] items-center gap-4 border-t border-zinc-200 px-5 py-4 transition hover:bg-zinc-50"
                  >
                    <div>
                      <p className="font-bold text-zinc-900">
                        {receipt.receiptNumber || "-"}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        ใบรับชำระเงิน
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold">{receipt.customerName || "-"}</p>
                      <p className="text-sm text-zinc-500">
                        {receipt.bookingNumber || "-"}
                      </p>
                    </div>
                    <div className="font-semibold">
                      {receipt.installmentNumber || "-"}
                    </div>
                    <div>
                      <p className="font-bold text-emerald-700">
                        ฿ {formatMoney(receipt.installmentAmount)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {receipt.paymentStatus || "-"}
                      </p>
                    </div>
                    <div className="text-sm text-zinc-600">
                      {formatSavedDate(receipt.savedAt)}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedReceipt(receipt)}
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 font-semibold text-zinc-700"
                      >
                        ดูรายละเอียด
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadReceipt(receipt)}
                        className="rounded-xl bg-zinc-900 px-3 py-2 font-semibold text-white"
                      >
                        ดาวน์โหลด
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReceipt(receipt)}
                        className="rounded-xl bg-red-600 px-3 py-2 font-semibold text-white"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center text-zinc-500">
                  ยังไม่มีใบรับชำระเงินในคลัง
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b pb-4">
              <div>
                <p className="text-sm font-bold text-emerald-700">
                  ใบรับชำระเงิน
                </p>
                <h2 className="mt-1 text-2xl font-black text-zinc-950">
                  {selectedReceipt.receiptNumber || "-"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="rounded-xl bg-zinc-100 px-4 py-2 font-bold text-zinc-600"
              >
                ปิด
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["ชื่อลูกค้า", selectedReceipt.customerName],
                ["เลขที่ใบจอง", selectedReceipt.bookingNumber],
                ["งวดที่", selectedReceipt.installmentNumber],
                ["วันที่ชำระ", selectedReceipt.paymentDateText],
                ["วิธีชำระ", selectedReceipt.paymentMethod],
                ["สถานะ", selectedReceipt.paymentStatus],
                [
                  "ยอดชำระงวดนี้",
                  `฿ ${formatMoney(selectedReceipt.installmentAmount)}`,
                ],
                [
                  "ยอดชำระสะสม",
                  `฿ ${formatMoney(selectedReceipt.cumulativePaid)}`,
                ],
                [
                  "ยอดคงเหลือ",
                  `฿ ${formatMoney(selectedReceipt.remainingAmount)}`,
                ],
                ["วันที่บันทึก", formatSavedDate(selectedReceipt.savedAt)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border bg-zinc-50 p-4">
                  <p className="text-xs font-semibold text-zinc-500">{label}</p>
                  <p className="mt-1 font-bold text-zinc-900">{value || "-"}</p>
                </div>
              ))}
            </div>

            {selectedReceipt.paymentNote &&
              selectedReceipt.paymentNote !== "-" && (
                <div className="mt-4 rounded-2xl border bg-zinc-50 p-4">
                  <p className="text-xs font-semibold text-zinc-500">หมายเหตุ</p>
                  <p className="mt-1 text-zinc-900">
                    {selectedReceipt.paymentNote}
                  </p>
                </div>
              )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => deleteReceipt(selectedReceipt)}
                className="rounded-2xl bg-red-50 px-5 py-3 font-bold text-red-600"
              >
                ลบเอกสาร
              </button>
              <button
                type="button"
                onClick={() => downloadReceipt(selectedReceipt)}
                className="rounded-2xl bg-zinc-950 px-5 py-3 font-bold text-white"
              >
                ดาวน์โหลด
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const BRAND_COPY = {
  pharadol: {
    name: "Pharadol Production",
    dashboardPath: "/pharadol/dashboard",
    subject: "ยืนยันรายละเอียดการจอง",
  },
  adisorn: {
    name: "Adisorn Wedding Studio",
    dashboardPath: "/adisorn/dashboard",
    subject: "ยืนยันรายละเอียดการจอง",
  },
};

const readArray = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const createDefaultMessage = (customer, brandName) => {
  const customerName = customer?.customerName || "ลูกค้า";

  return [
    `เรียน คุณ${customerName}`,
    "",
    `${brandName} ขอแจ้งรายละเอียดการจองงานของท่านดังนี้`,
    `เลขที่จอง: ${customer?.bookingNumber || "-"}`,
    `บริการ: ${customer?.service || "-"}`,
    `วันที่จัดงาน: ${customer?.eventDate || "-"}`,
    `สถานที่: ${customer?.location || "-"}`,
    "",
    "หากข้อมูลส่วนใดต้องแก้ไข สามารถตอบกลับอีเมลฉบับนี้ได้เลยครับ",
    "",
    "ขอบคุณครับ",
    brandName,
  ].join("\n");
};

const createMailFingerprint = ({ bookingNumber, recipient, subject }) =>
  [
    String(bookingNumber || "").trim(),
    String(recipient || "").trim().toLowerCase(),
    String(subject || "").trim().toLowerCase(),
  ].join("|");

const formatSentDateTime = (value) => {
  if (!value) return "ยังไม่ได้ส่ง";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ยังไม่ได้ส่ง";

  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function BrandMailPage({ brandId }) {
  const router = useRouter();
  const brand = BRAND_COPY[brandId];
  const customersKey = `${brandId}_customers`;
  const emailHistoryKey = `${brandId}_email_history`;
  const mailTrashKey = `${brandId}_mail_trash`;
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [emailHistory, setEmailHistory] = useState([]);
  const [mailTrash, setMailTrash] = useState([]);
  const [selectedBookingNumber, setSelectedBookingNumber] = useState("");
  const [selectedEmailId, setSelectedEmailId] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState(brand.subject);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState("sent");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const normalizedBrands = Array.isArray(currentUser?.brands)
          ? currentUser.brands.map((item) =>
              item === "pharadon" ? "pharadol" : item
            )
          : [];
        const isAdmin = currentUser?.role === "ADMIN";
        const hasBrandAccess = normalizedBrands.includes(brandId);
        const accountIsActive = currentUser?.active !== false;
        const brandIsCorrect =
          activeBrand === brandId && (isAdmin || hasBrandAccess);
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
      } catch {
        sessionStorage.clear();
        window.location.replace("/login");
        return false;
      }
    };

    verifyAccess();
  }, [brandId]);

  useEffect(() => {
    if (!isAuthorized) return;

    const load = () => {
      setCustomers(readArray(customersKey));
      setEmailHistory(
        readArray(emailHistoryKey).filter((item) => item.brandId === brandId)
      );
      setMailTrash(readArray(mailTrashKey));
    };

    load();
    window.addEventListener("focus", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("storage", load);
    };
  }, [brandId, customersKey, emailHistoryKey, isAuthorized, mailTrashKey]);

  const emailCustomers = useMemo(
    () =>
      customers
        .filter((customer) => String(customer.email || "").includes("@"))
        .sort((a, b) =>
          String(b.bookingNumber || "").localeCompare(
            String(a.bookingNumber || ""),
            "th"
          )
        ),
    [customers]
  );

  const filteredHistory = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return emailHistory.filter((item) => {
      if (!keyword) return true;
      return [
        item.customerName,
        item.recipient,
        item.subject,
        item.bookingNumber,
        item.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [emailHistory, search]);

  const filteredMailTrash = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return mailTrash.filter((item) => {
      if (!keyword) return true;
      return [
        item.customerName,
        item.recipient,
        item.email,
        item.subject,
        item.bookingNumber,
        item.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [mailTrash, search]);

  const selectedEmail =
    emailHistory.find((item) => item.id === selectedEmailId) || null;

  const selectedCustomer = useMemo(
    () =>
      emailCustomers.find(
        (item) => item.bookingNumber === selectedBookingNumber
      ) || null,
    [emailCustomers, selectedBookingNumber]
  );

  const currentMailFingerprint = useMemo(
    () =>
      createMailFingerprint({
        bookingNumber: selectedBookingNumber,
        recipient,
        subject,
      }),
    [recipient, selectedBookingNumber, subject]
  );

  const sentRecordForCurrentMail = useMemo(() => {
    const trimmedRecipient = recipient.trim().toLowerCase();
    const trimmedSubject = subject.trim().toLowerCase();

    if (!trimmedRecipient || !trimmedSubject) return null;

    return (
      emailHistory.find((item) => {
        if (item.status !== "sent") return false;
        if (item.mailFingerprint) {
          return item.mailFingerprint === currentMailFingerprint;
        }

        const sameBooking =
          String(item.bookingNumber || "") ===
          String(selectedBookingNumber || "");
        const sameRecipient =
          String(item.recipient || "").trim().toLowerCase() ===
          trimmedRecipient;
        const sameSubject =
          String(item.subject || "").trim().toLowerCase() === trimmedSubject;

        return sameBooking && sameRecipient && sameSubject;
      }) || null
    );
  }, [
    currentMailFingerprint,
    emailHistory,
    recipient,
    selectedBookingNumber,
    subject,
  ]);

  const selectCustomer = (bookingNumber) => {
    const customer =
      emailCustomers.find((item) => item.bookingNumber === bookingNumber) ||
      null;

    setSelectedEmailId("");
    setSelectedBookingNumber(bookingNumber);
    setRecipient(customer?.email || "");
    setSubject(`${brand.subject} ${customer?.bookingNumber || ""}`.trim());
    setMessage(createDefaultMessage(customer, brand.name));
    setIsComposerOpen(true);
    setStatusMessage("");
  };

  const openNewMail = () => {
    setSelectedBookingNumber("");
    setSelectedEmailId("");
    setRecipient("");
    setSubject(brand.subject);
    setMessage("");
    setIsComposerOpen(true);
    setStatusMessage("");
  };

  const closeComposer = () => {
    setIsComposerOpen(false);
    setStatusMessage("");
  };

  const editEmail = (email) => {
    setSelectedEmailId(email.id || "");
    setSelectedBookingNumber(email.bookingNumber || "");
    setRecipient(email.recipient || email.email || "");
    setSubject(email.subject || brand.subject);
    setMessage(email.body || "");
    setIsComposerOpen(true);
    setStatusMessage("แก้ไขอีเมลแล้วกดส่งอีกครั้งได้");
  };

  const moveHistoryToMailTrash = (records) => {
    const deletedAt = new Date();
    const movingRecords = records.map((record) => ({
      ...record,
      email: record.email || record.recipient || "",
      deletedFrom: "sent-mail",
      deletedAt: deletedAt.toISOString(),
      deletedDate: deletedAt.toLocaleString("th-TH"),
    }));
    const movingIds = new Set(movingRecords.map((record) => record.id));
    const nextHistory = emailHistory.filter(
      (item) => !movingIds.has(item.id)
    );
    const currentTrash = readArray(mailTrashKey);
    const nextTrash = [
      ...movingRecords,
      ...currentTrash.filter((item) => !movingIds.has(item.id)),
    ];

    localStorage.setItem(emailHistoryKey, JSON.stringify(nextHistory));
    localStorage.setItem(mailTrashKey, JSON.stringify(nextTrash));
    setEmailHistory(nextHistory);
    setMailTrash(nextTrash);
    setSelectedIds([]);
    setSelectedEmailId("");
  };

  const deleteEmailRecord = (email) => {
    if (!window.confirm("ต้องการย้ายอีเมลนี้ไปขยะเมลหรือไม่?")) return;
    moveHistoryToMailTrash([email]);
    setStatusMessage("ย้ายอีเมลไปขยะเมลเรียบร้อย");
  };

  const restoreEmailFromTrash = (email) => {
    const nextTrash = mailTrash.filter((item) => item.id !== email.id);
    const restoredEmail = {
      ...email,
      status: "sent",
      restoredAt: new Date().toISOString(),
    };
    delete restoredEmail.deletedFrom;
    delete restoredEmail.deletedAt;
    delete restoredEmail.deletedDate;

    const nextHistory = [restoredEmail, ...emailHistory];
    localStorage.setItem(mailTrashKey, JSON.stringify(nextTrash));
    localStorage.setItem(emailHistoryKey, JSON.stringify(nextHistory));
    setMailTrash(nextTrash);
    setEmailHistory(nextHistory);
    setSelectedEmailId(restoredEmail.id || "");
    setActiveFolder("sent");
  };

  const deleteMailForever = (email) => {
    if (!window.confirm("ต้องการลบอีเมลนี้ถาวรหรือไม่?")) return;

    const nextTrash = mailTrash.filter((item) => item.id !== email.id);
    localStorage.setItem(mailTrashKey, JSON.stringify(nextTrash));
    setMailTrash(nextTrash);
    setSelectedEmailId("");
  };

  const moveCurrentMailToTrash = () => {
    if (!selectedCustomer) {
      setStatusMessage("กรุณาเลือกลูกค้าที่ต้องการลบก่อน");
      return;
    }

    const confirmed = window.confirm(
      `ต้องการย้ายอีเมลของใบจอง ${
        selectedCustomer.bookingNumber || "นี้"
      } ไปขยะเมลหรือไม่?`
    );

    if (!confirmed) return;

    try {
      const deletedAt = new Date();
      const trashRecord = {
        ...selectedCustomer,
        deletedFrom: "mail",
        deletedAt: deletedAt.toISOString(),
        deletedDate: deletedAt.toLocaleString("th-TH"),
      };
      const currentTrash = readArray(mailTrashKey);
      const updatedTrash = [
        trashRecord,
        ...currentTrash.filter(
          (item) =>
            item.bookingNumber !== selectedCustomer.bookingNumber ||
            item.email !== selectedCustomer.email
        ),
      ];

      localStorage.setItem(mailTrashKey, JSON.stringify(updatedTrash));
      setMailTrash(updatedTrash);
      setSelectedBookingNumber("");
      setSelectedEmailId("");
      setRecipient("");
      setSubject(brand.subject);
      setMessage("");
      setStatusMessage("ย้ายอีเมลไปขยะเมลเรียบร้อย");
      window.alert("ย้ายอีเมลไปขยะเมลเรียบร้อย");
    } catch (error) {
      console.error("Cannot move mail customer to trash", error);
      window.alert("ไม่สามารถย้ายอีเมลไปขยะเมลได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const saveEmailHistory = (record) => {
    const nextHistory = [record, ...readArray(emailHistoryKey)];
    localStorage.setItem(emailHistoryKey, JSON.stringify(nextHistory));
    setEmailHistory(nextHistory.filter((item) => item.brandId === brandId));
  };

  const sendEmail = async ({ force = false, draft = null } = {}) => {
    const draftRecipient = draft?.recipient ?? recipient;
    const draftSubject = draft?.subject ?? subject;
    const draftMessage = draft?.body ?? message;
    const draftBookingNumber = draft?.bookingNumber ?? selectedBookingNumber;
    const draftCustomerName = draft?.customerName ?? selectedCustomer?.customerName ?? "";
    const draftFingerprint =
      draft?.mailFingerprint ||
      createMailFingerprint({
        bookingNumber: draftBookingNumber,
        recipient: draftRecipient,
        subject: draftSubject,
      });
    const trimmedRecipient = draftRecipient.trim();
    const trimmedSubject = draftSubject.trim();
    const trimmedMessage = draftMessage.trim();

    if (!trimmedRecipient || !trimmedRecipient.includes("@")) {
      setStatusMessage("กรุณาเลือกหรือกรอกอีเมลผู้รับให้ถูกต้อง");
      return;
    }

    if (!trimmedSubject || !trimmedMessage) {
      setStatusMessage("กรุณากรอกหัวข้อและเนื้อหาอีเมลให้ครบถ้วน");
      return;
    }

    if (!force && sentRecordForCurrentMail) {
      setStatusMessage("เมลนี้ได้ส่งแล้ว");
      window.alert("เมลนี้ได้ส่งแล้ว");
      return;
    }

    setIsSending(true);
    setStatusMessage("");

    try {
      const response = await fetch("/api/send-booking-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          expectedBrandId: brandId,
          to: trimmedRecipient,
          subject: trimmedSubject,
          body: trimmedMessage,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "ส่งอีเมลไม่สำเร็จ");
      }

      saveEmailHistory({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        brandId,
        bookingNumber: draftBookingNumber,
        mailFingerprint: draftFingerprint,
        customerName: draftCustomerName,
        recipient: trimmedRecipient,
        subject: trimmedSubject,
        body: trimmedMessage,
        sentAt: new Date().toISOString(),
        status: "sent",
        messageId: result?.id || "",
        pdfDriveLink: "",
      });
      setStatusMessage("ส่งอีเมลเรียบร้อยแล้ว");
      setIsComposerOpen(false);
    } catch (error) {
      setStatusMessage(error.message || "ส่งอีเมลไม่สำเร็จ");
    } finally {
      setIsSending(false);
    }
  };

  const sendEmailAgain = async (email) => {
    const confirmed = window.confirm("ต้องการส่งอีเมลนี้อีกครั้งใช่ไหม?");
    if (!confirmed) return;

    setSelectedBookingNumber(email.bookingNumber || "");
    setRecipient(email.recipient || email.email || "");
    setSubject(email.subject || brand.subject);
    setMessage(email.body || "");
    await sendEmail({
      force: true,
      draft: {
        bookingNumber: email.bookingNumber || "",
        customerName: email.customerName || "",
        recipient: email.recipient || email.email || "",
        subject: email.subject || brand.subject,
        body: email.body || "",
      },
    });
  };

  const toggleSelected = (id) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm("ต้องการย้ายอีเมลที่เลือกไปขยะเมลใช่ไหม?")) return;

    moveHistoryToMailTrash(
      emailHistory.filter((item) => selectedIds.includes(item.id))
    );
  };

  const clearAll = () => {
    if (emailHistory.length === 0) return;
    if (!window.confirm("ต้องการย้ายอีเมลทั้งหมดไปขยะเมลใช่ไหม?")) return;

    moveHistoryToMailTrash(emailHistory);
  };

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-3 text-zinc-900 sm:p-4 md:p-6 xl:p-8">
      <div className="mx-auto w-full max-w-[1536px]">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">อีเมล</h1>
            <p className="mt-1 text-zinc-500">
              จัดการการส่งและประวัติอีเมลของพื้นที่งานนี้
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              type="button"
              onClick={openNewMail}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-3xl font-semibold leading-none text-white hover:bg-blue-700 sm:h-12 sm:w-12"
              aria-label="สร้างอีเมลใหม่"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => router.push(brand.dashboardPath)}
              className="min-h-11 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 sm:min-h-12 sm:px-5 sm:py-3 sm:text-base"
            >
              กลับสู่หน้าหลัก
            </button>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold">กล่องเมล</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    เลือกเมลทางซ้ายเพื่อดูเต็มหน้ากลาง
                  </p>
                </div>
                {activeFolder === "sent" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={deleteSelected}
                      className="min-h-10 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-100"
                    >
                      ลบ
                    </button>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      ล้างทั้งหมด
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveFolder("sent");
                    setIsComposerOpen(false);
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                    activeFolder === "sent"
                      ? "bg-zinc-950 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  ส่งแล้ว {emailHistory.length}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveFolder("trash");
                    setSelectedEmailId("");
                    setIsComposerOpen(false);
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                    activeFolder === "trash"
                      ? "bg-zinc-950 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  ขยะเมล {mailTrash.length}
                </button>
              </div>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาอีเมล"
                className="mt-3 w-full rounded-xl border border-zinc-300 px-4 py-2.5 outline-none focus:border-black"
              />
            </div>

            <div className="max-h-[48vh] divide-y divide-zinc-100 overflow-auto xl:max-h-[430px]">
              {activeFolder === "sent" &&
                filteredHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 ${
                      selectedEmailId === item.id && !isComposerOpen
                        ? "bg-blue-50"
                        : "bg-white"
                    }`}
                  >
                    <div className="flex gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        className="mt-1 h-4 w-4"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEmailId(item.id);
                          setSelectedBookingNumber(item.bookingNumber || "");
                          setRecipient(item.recipient || item.email || "");
                          setSubject(item.subject || brand.subject);
                          setMessage(item.body || "");
                          setIsComposerOpen(false);
                          setStatusMessage("");
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-bold">
                          {item.customerName || item.recipient}
                        </p>
                        <p className="truncate text-sm text-zinc-600">
                          {item.subject}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {new Date(item.sentAt).toLocaleString("th-TH")} • ส่งแล้ว
                        </p>
                      </button>
                    </div>
                  </div>
                ))}

              {activeFolder === "trash" &&
                filteredMailTrash.map((item) => (
                  <div
                    key={item.id || `${item.bookingNumber}-${item.email}`}
                    className="p-3"
                  >
                    <p className="truncate text-sm font-bold">
                      {item.customerName || item.recipient || item.email}
                    </p>
                    <p className="truncate text-sm text-zinc-600">
                      {item.subject || item.bookingNumber || "-"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {item.deletedDate || formatSentDateTime(item.deletedAt)}
                    </p>
                    {item.id && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => restoreEmailFromTrash(item)}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
                        >
                          กู้คืน
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMailForever(item)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                        >
                          ลบถาวร
                        </button>
                      </div>
                    )}
                  </div>
                ))}

              {activeFolder === "sent" && filteredHistory.length === 0 && (
                <div className="p-8 text-center text-zinc-500">
                  ยังไม่มีเมลที่ส่งแล้ว
                </div>
              )}
              {activeFolder === "trash" && filteredMailTrash.length === 0 && (
                <div className="p-8 text-center text-zinc-500">
                  ยังไม่มีขยะเมล
                </div>
              )}
            </div>

            <div className="border-t border-zinc-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">ลูกค้าที่มีอีเมล</h3>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold">
                  {emailCustomers.length}
                </span>
              </div>
              <div className="max-h-[220px] space-y-2 overflow-auto">
                {emailCustomers.map((customer) => (
                  <button
                    key={customer.bookingNumber || customer.email}
                    type="button"
                    onClick={() => selectCustomer(customer.bookingNumber)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedBookingNumber === customer.bookingNumber &&
                      isComposerOpen
                        ? "border-black bg-zinc-950 text-white"
                        : "border-zinc-200 hover:border-zinc-400"
                    }`}
                  >
                    <p className="font-bold">
                      {customer.customerName || "ไม่ระบุชื่อลูกค้า"}
                    </p>
                    <p className="mt-1 truncate text-sm opacity-70">
                      {customer.bookingNumber || "-"} • {customer.email}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm md:p-5">
            {isComposerOpen ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-bold">เขียนอีเมล</h2>
                  <button
                    type="button"
                    onClick={closeComposer}
                    className="min-h-10 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-100"
                  >
                    ปิด
                  </button>
                </div>
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  <label className="flex flex-col gap-1 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center">
                    <span className="w-16 shrink-0 text-sm font-semibold text-zinc-500">
                      ถึง
                    </span>
                    <input
                      type="email"
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                      placeholder="อีเมลลูกค้า"
                      className="min-w-0 flex-1 bg-transparent text-base outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center">
                    <span className="w-16 shrink-0 text-sm font-semibold text-zinc-500">
                      หัวข้อ
                    </span>
                    <input
                      type="text"
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      placeholder="หัวข้ออีเมล"
                      className="min-w-0 flex-1 bg-transparent text-base outline-none"
                    />
                  </label>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={17}
                    placeholder="เนื้อหาอีเมล"
                    className="min-h-[280px] w-full resize-y px-4 py-4 leading-8 outline-none md:min-h-[420px] md:px-6 md:py-5"
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        statusMessage === "ส่งอีเมลเรียบร้อยแล้ว" ||
                        statusMessage === "ย้ายอีเมลไปขยะเมลเรียบร้อย"
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {statusMessage}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      วัน เดือน ปี เวลา ที่ส่ง:{" "}
                      <span className="font-semibold text-zinc-800">
                        {formatSentDateTime(sentRecordForCurrentMail?.sentAt)}
                      </span>
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <button
                      type="button"
                      onClick={moveCurrentMailToTrash}
                      className="min-h-12 rounded-xl border border-zinc-300 px-5 py-3 font-semibold hover:bg-zinc-100"
                    >
                      ลบ
                    </button>
                    <button
                      type="button"
                      onClick={() => sendEmail()}
                      disabled={isSending}
                      className="min-h-12 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {isSending ? "กำลังส่ง..." : "ส่งอีเมล"}
                    </button>
                  </div>
                </div>
              </>
            ) : selectedEmail ? (
              <div className="min-h-[60vh] xl:min-h-[720px]">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-500">
                      เมลที่ส่งแล้ว
                    </p>
                    <h2 className="mt-2 break-words text-2xl font-black">
                      {selectedEmail.subject}
                    </h2>
                    <p className="mt-2 text-zinc-500">
                      ถึง{" "}
                      <span className="font-semibold text-zinc-800">
                        {selectedEmail.recipient}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      ส่งเมื่อ {formatSentDateTime(selectedEmail.sentAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => editEmail(selectedEmail)}
                      className="min-h-10 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-100"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => sendEmailAgain(selectedEmail)}
                      disabled={isSending}
                      className="min-h-10 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      ส่งอีกครั้ง
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEmailRecord(selectedEmail)}
                      className="min-h-10 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      ลบ
                    </button>
                  </div>
                </div>

                {selectedEmail.pdfDriveLink && (
                  <a
                    href={selectedEmail.pdfDriveLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex rounded-xl bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
                  >
                    เปิด PDF ใน Google Drive
                  </a>
                )}

                <article className="mt-5 max-h-[70vh] min-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-7 text-zinc-800 md:min-h-[520px] md:p-6 md:text-base md:leading-8">
                  {selectedEmail.body}
                </article>
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 p-6 text-center md:min-h-[560px] md:p-8">
                <p className="text-2xl font-bold">เลือกเมลเพื่อดูรายละเอียด</p>
                <p className="mt-2 max-w-sm text-zinc-500">
                  เลือกเมลที่ส่งแล้วจากกล่องเมลด้านซ้าย หรือกด + เพื่อสร้างเมลใหม่
                </p>
                <button
                  type="button"
                  onClick={openNewMail}
                  className="mt-5 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
                >
                  สร้างเมลใหม่
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const CUSTOM_BOOKING_NUMBER_KEY = "pharadol_customBookingNumber";
const BOOKING_NUMBER_HISTORY_KEY = "pharadol_bookingNumberHistory";
const BOOKING_NUMBER_MODE_KEY = "pharadol_bookingNumberMode";
const BOOKING_NUMBER_UPDATED_EVENT = "pharadol:booking-number-updated";
const BOOKING_NUMBER_CHANNEL = "pharadol-booking-number";
const NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY =
  "pharadol_nextBookingSequenceOverride";
const RESET_BOOKING_SEQUENCE_ACTIVE_KEY =
  "pharadol_resetBookingSequenceActive";
const TEAM_MEMBERS_KEY = "pharadol_team_members";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isBarcodePage = searchParams.get("section") === "barcode";
  const isTeamPage = searchParams.get("section") === "team";

  const [customBookingNumber, setCustomBookingNumber] = useState("");
  const [savedBookingNumber, setSavedBookingNumber] = useState("");
  const [bookingNumberMode, setBookingNumberMode] = useState("auto");
  const [bookingNumberHistory, setBookingNumberHistory] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [newTeamMember, setNewTeamMember] = useState({
    name: "",
    role: "",
    phone: "",
    email: "",
  });
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const accountIsActive = currentUser?.active !== false;
        const brandIsCorrect = activeBrand === "pharadol";
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
        console.error("Cannot verify Pharadol settings access", error);
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

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );

    return () => {
      window.clearInterval(sessionCheck);
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    const loadBookingSettings = () => {
      const savedValue =
        localStorage.getItem(CUSTOM_BOOKING_NUMBER_KEY) || "";

      const savedMode =
        localStorage.getItem(BOOKING_NUMBER_MODE_KEY) ||
        (savedValue ? "custom" : "auto");

      setCustomBookingNumber(savedValue);
      setSavedBookingNumber(savedValue);
      setBookingNumberMode(savedMode);

      try {
        const savedHistory = JSON.parse(
          localStorage.getItem(BOOKING_NUMBER_HISTORY_KEY) || "[]"
        );
        setBookingNumberHistory(
          Array.isArray(savedHistory) ? savedHistory : []
        );
      } catch (error) {
        console.error("Cannot load booking number history", error);
        setBookingNumberHistory([]);
      }
    };

    const handleBookingSettingsStorage = (event) => {
      if (
        event.key === CUSTOM_BOOKING_NUMBER_KEY ||
        event.key === BOOKING_NUMBER_HISTORY_KEY ||
        event.key === BOOKING_NUMBER_MODE_KEY ||
        event.key === NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY ||
        event.key === RESET_BOOKING_SEQUENCE_ACTIVE_KEY
      ) {
        loadBookingSettings();
      }
    };

    loadBookingSettings();

    window.addEventListener("focus", loadBookingSettings);
    window.addEventListener("storage", handleBookingSettingsStorage);

    return () => {
      window.removeEventListener("focus", loadBookingSettings);
      window.removeEventListener("storage", handleBookingSettingsStorage);
    };
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;

    const loadTeamMembers = () => {
      try {
        const savedTeamMembers = JSON.parse(
          localStorage.getItem(TEAM_MEMBERS_KEY) || "[]"
        );
        setTeamMembers(
          Array.isArray(savedTeamMembers) ? savedTeamMembers : []
        );
      } catch (error) {
        console.error("Cannot load team members", error);
        setTeamMembers([]);
      }
    };

    loadTeamMembers();
    window.addEventListener("focus", loadTeamMembers);
    window.addEventListener("storage", loadTeamMembers);

    return () => {
      window.removeEventListener("focus", loadTeamMembers);
      window.removeEventListener("storage", loadTeamMembers);
    };
  }, [isAuthorized]);

  const saveTeamMembers = (nextTeamMembers) => {
    localStorage.setItem(TEAM_MEMBERS_KEY, JSON.stringify(nextTeamMembers));
    setTeamMembers(nextTeamMembers);
  };

  const addTeamMember = () => {
    const name = newTeamMember.name.trim();
    const role = newTeamMember.role.trim();

    if (!name || !role) {
      alert("กรุณากรอกชื่อทีมงานและตำแหน่งให้ครบ");
      return;
    }

    const teamMember = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      role,
      phone: newTeamMember.phone.trim(),
      email: newTeamMember.email.trim(),
      active: true,
      createdAt: new Date().toISOString(),
    };

    saveTeamMembers([teamMember, ...teamMembers]);
    setNewTeamMember({
      name: "",
      role: "",
      phone: "",
      email: "",
    });
  };

  const toggleTeamMember = (id) => {
    saveTeamMembers(
      teamMembers.map((member) =>
        member.id === id ? { ...member, active: member.active === false } : member
      )
    );
  };

  const deleteTeamMember = (id) => {
    if (!confirm("ต้องการลบทีมงานคนนี้หรือไม่?")) return;
    saveTeamMembers(teamMembers.filter((member) => member.id !== id));
  };

  const notifyBookingNumberUpdated = (
    mode,
    bookingNumber = "",
    sequenceOverride = null
  ) => {
    const detail = { mode, bookingNumber, sequenceOverride };

    window.dispatchEvent(
      new CustomEvent(BOOKING_NUMBER_UPDATED_EVENT, { detail })
    );

    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(BOOKING_NUMBER_CHANNEL);
      channel.postMessage(detail);
      channel.close();
    }
  };

  const applyBookingNumberMode = (mode) => {
    setBookingNumberMode(mode);
    localStorage.setItem(BOOKING_NUMBER_MODE_KEY, mode);

    if (mode === "auto") {
      localStorage.removeItem(CUSTOM_BOOKING_NUMBER_KEY);
      localStorage.removeItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY);
      localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY);
      setCustomBookingNumber("");
      setSavedBookingNumber("");
      notifyBookingNumberUpdated("auto");
      return;
    }

    localStorage.removeItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY);
    localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY);
    const nextBookingNumber =
      customBookingNumber || savedBookingNumber || "";

    if (nextBookingNumber) {
      localStorage.setItem(
        CUSTOM_BOOKING_NUMBER_KEY,
        nextBookingNumber
      );
    }

    notifyBookingNumberUpdated("custom", nextBookingNumber);
  };

  const propagateBookingNumberToAllPages = (nextBookingNumber) => {
    const selectedKeys = [
      "pharadol_selectedBooking",
      "pharadol_currentBooking",
    ];

    let originalBookingNumber = "";

    selectedKeys.forEach((key) => {
      try {
        const rawValue = localStorage.getItem(key);
        if (!rawValue) return;

        const booking = JSON.parse(rawValue);
        if (!booking || typeof booking !== "object") return;

        if (!originalBookingNumber && booking.bookingNumber) {
          originalBookingNumber = booking.bookingNumber;
        }

        localStorage.setItem(
          key,
          JSON.stringify({
            ...booking,
            bookingNumber: nextBookingNumber,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch (error) {
        console.error(`Cannot update booking number in ${key}`, error);
      }
    });

    if (!originalBookingNumber) return;

    const collectionKeys = [
      "pharadol_customers",
      "pharadol_archives",
      "pharadol_trash",
    ];

    collectionKeys.forEach((key) => {
      try {
        const rawValue = localStorage.getItem(key);
        if (!rawValue) return;

        const items = JSON.parse(rawValue);
        if (!Array.isArray(items)) return;

        const updatedItems = items.map((item) =>
          item?.bookingNumber === originalBookingNumber
            ? {
                ...item,
                bookingNumber: nextBookingNumber,
                updatedAt: new Date().toISOString(),
              }
            : item
        );

        localStorage.setItem(key, JSON.stringify(updatedItems));
      } catch (error) {
        console.error(`Cannot update booking number in ${key}`, error);
      }
    });

    window.dispatchEvent(
      new CustomEvent("pharadol:booking-data-updated", {
        detail: {
          originalBookingNumber,
          bookingNumber: nextBookingNumber,
        },
      })
    );
  };

  const normalizeBookingNumber = (value) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 40);

  const saveHistory = (nextHistory) => {
    localStorage.setItem(
      BOOKING_NUMBER_HISTORY_KEY,
      JSON.stringify(nextHistory)
    );
    setBookingNumberHistory(nextHistory);
  };

  const addHistoryItem = ({ mode, bookingNumber = "", action }) => {
    const historyItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mode,
      bookingNumber,
      action,
      createdAt: new Date().toISOString(),
      createdAtText: new Date().toLocaleString("th-TH"),
    };

    const nextHistory = [historyItem, ...bookingNumberHistory].slice(0, 30);
    saveHistory(nextHistory);
  };

  const reuseHistoryItem = (item) => {
    if (item.mode === "custom" && item.bookingNumber) {
      localStorage.setItem(CUSTOM_BOOKING_NUMBER_KEY, item.bookingNumber);
      localStorage.setItem(BOOKING_NUMBER_MODE_KEY, "custom");
      localStorage.removeItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY);
      localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY);
      setBookingNumberMode("custom");
      setCustomBookingNumber(item.bookingNumber);
      setSavedBookingNumber(item.bookingNumber);
      notifyBookingNumberUpdated("custom", item.bookingNumber);
      propagateBookingNumberToAllPages(item.bookingNumber);
      return;
    }

    localStorage.removeItem(CUSTOM_BOOKING_NUMBER_KEY);
    localStorage.setItem(BOOKING_NUMBER_MODE_KEY, "auto");
    localStorage.removeItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY);
    localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY);
    setBookingNumberMode("auto");
    setCustomBookingNumber("");
    setSavedBookingNumber("");
    notifyBookingNumberUpdated("auto");
  };

  const deleteHistoryItem = (id) => {
    saveHistory(
      bookingNumberHistory.filter((item) => item.id !== id)
    );
  };

  const clearHistory = () => {
    if (bookingNumberHistory.length === 0) return;

    const confirmed = window.confirm(
      "ต้องการล้างประวัติการตั้งค่าบาร์โค้ดทั้งหมดหรือไม่?"
    );

    if (!confirmed) return;

    localStorage.removeItem(BOOKING_NUMBER_HISTORY_KEY);
    setBookingNumberHistory([]);
  };

  const saveCustomBookingNumber = () => {
    if (bookingNumberMode === "auto") {
      localStorage.removeItem(CUSTOM_BOOKING_NUMBER_KEY);
      localStorage.setItem(BOOKING_NUMBER_MODE_KEY, "auto");
      localStorage.removeItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY);
      localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY);
      setCustomBookingNumber("");
      setSavedBookingNumber("");
      notifyBookingNumberUpdated("auto");
      addHistoryItem({
        mode: "auto",
        action: "เปลี่ยนกลับมาใช้เลขที่การจองอัตโนมัติ",
      });
      alert("ตั้งค่าให้ระบบใช้เลขที่การจองอัตโนมัติแล้ว");
      return;
    }

    const normalizedValue = normalizeBookingNumber(customBookingNumber.trim());

    if (!normalizedValue) {
      alert("กรุณากรอกเลขที่การจองที่ต้องการใช้");
      return;
    }

    localStorage.setItem(CUSTOM_BOOKING_NUMBER_KEY, normalizedValue);
    localStorage.setItem(BOOKING_NUMBER_MODE_KEY, "custom");
    localStorage.removeItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY);
    localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY);
    setCustomBookingNumber(normalizedValue);
    setSavedBookingNumber(normalizedValue);
    notifyBookingNumberUpdated("custom", normalizedValue);
    propagateBookingNumberToAllPages(normalizedValue);
    addHistoryItem({
      mode: "custom",
      bookingNumber: normalizedValue,
      action: "บันทึกเลขที่การจองแบบกำหนดเอง",
    });
    alert("ตั้งค่าให้ระบบใช้เลขที่การจองแบบกำหนดเองแล้ว");
  };

  const clearCustomBookingNumber = () => {
    localStorage.removeItem(CUSTOM_BOOKING_NUMBER_KEY);
    localStorage.setItem(BOOKING_NUMBER_MODE_KEY, "auto");
    localStorage.removeItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY);
    localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY);
    setCustomBookingNumber("");
    setSavedBookingNumber("");
    setBookingNumberMode("auto");
    notifyBookingNumberUpdated("auto");
    addHistoryItem({
      mode: "auto",
      action: "กลับไปใช้เลขที่การจองอัตโนมัติ",
    });
    alert("ตั้งค่าให้ระบบใช้เลขที่การจองอัตโนมัติแล้ว");
  };

  const resetBarcodeSettings = () => {
    const confirmed = window.confirm(
      "ต้องการรีเซ็ตการตั้งค่าบาร์โค้ดทั้งหมดหรือไม่? เลขอัตโนมัติจะเริ่มใหม่ที่ 0001"
    );

    if (!confirmed) return;

    localStorage.removeItem(CUSTOM_BOOKING_NUMBER_KEY);
    localStorage.setItem(BOOKING_NUMBER_MODE_KEY, "auto");
    localStorage.setItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY, "true");

    localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY);
    localStorage.setItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY, "1");

    setCustomBookingNumber("");
    setSavedBookingNumber("");
    setBookingNumberMode("auto");

    notifyBookingNumberUpdated("auto", "", 1);

    addHistoryItem({
      mode: "auto",
      bookingNumber: "0001",
      action: "รีเซ็ตเลขอัตโนมัติกลับมาเริ่มที่ 0001",
    });

    alert("รีเซ็ตเรียบร้อย เลขอัตโนมัติจะเริ่มใหม่ที่ 0001");
  };

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">
              {isBarcodePage
                ? "จัดการบาร์โค้ด"
                : isTeamPage
                  ? "จัดการทีมงาน"
                  : "ตั้งค่าระบบ"}
            </h1>
            <p className="mt-1 text-zinc-500">
              {isBarcodePage
                ? "กำหนดเลขที่การจองและบาร์โค้ดสำหรับใบจองถัดไป"
                : isTeamPage
                  ? "บันทึกทีมงานที่ใช้ประจำในระบบ"
                : "เลือกหัวข้อที่ต้องการจัดการ"}
            </p>
          </div>

          <div className="flex gap-3">
            {isBarcodePage || isTeamPage ? (
              <button
                type="button"
                onClick={() => router.push("/pharadol/settings")}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                กลับหน้าตั้งค่า
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/pharadol")}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                กลับหน้าสร้างใบจอง
              </button>
            )}

            <button
              type="button"
              onClick={() => router.push("/pharadol/dashboard")}
              className="rounded-xl bg-black px-4 py-2 font-semibold text-white transition hover:bg-zinc-800"
            >
              เมนูหลัก
            </button>
          </div>
        </div>

        {!isBarcodePage && !isTeamPage ? (
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => router.push("/pharadol/settings?section=barcode")}
              className="group rounded-3xl border border-zinc-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-xl text-white">
                ▥
              </div>

              <h2 className="text-xl font-bold text-zinc-900">
                จัดการบาร์โค้ด
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                กำหนดเลขที่การจองสำหรับใบจองถัดไป หรือกลับไปใช้เลขอัตโนมัติ
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4">
                <span className="text-sm font-semibold text-zinc-700">
                  {savedBookingNumber
                    ? `เลขที่ตั้งไว้: ${savedBookingNumber}`
                    : "กำลังใช้เลขอัตโนมัติ"}
                </span>
                <span className="text-xl text-zinc-400 transition group-hover:translate-x-1">
                  →
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => router.push("/pharadol/settings?section=team")}
              className="group rounded-3xl border border-zinc-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-xl text-white">
                ◉
              </div>

              <h2 className="text-xl font-bold text-zinc-900">
                จัดการทีมงาน
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                บันทึกชื่อ ตำแหน่ง เบอร์โทร และอีเมลของทีมที่ใช้งานประจำ
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4">
                <span className="text-sm font-semibold text-zinc-700">
                  {teamMembers.length} คนในทีม
                </span>
                <span className="text-xl text-zinc-400 transition group-hover:translate-x-1">
                  →
                </span>
              </div>
            </button>
          </div>
        ) : isTeamPage ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Team Members
              </p>
              <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                รายชื่อทีมงาน
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                เก็บรายชื่อทีมงานที่ใช้งานประจำ เพื่อเลือกใช้ต่อในใบจอง ปฏิทิน หรือรายงานภายหลัง
              </p>
            </div>

            <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 md:grid-cols-2">
              <input
                value={newTeamMember.name}
                onChange={(event) =>
                  setNewTeamMember({ ...newTeamMember, name: event.target.value })
                }
                placeholder="ชื่อทีมงาน"
                className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-black"
              />
              <input
                value={newTeamMember.role}
                onChange={(event) =>
                  setNewTeamMember({ ...newTeamMember, role: event.target.value })
                }
                placeholder="ตำแหน่ง เช่น ช่างภาพหลัก"
                className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-black"
              />
              <input
                value={newTeamMember.phone}
                onChange={(event) =>
                  setNewTeamMember({ ...newTeamMember, phone: event.target.value })
                }
                placeholder="เบอร์โทร"
                className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-black"
              />
              <input
                type="email"
                value={newTeamMember.email}
                onChange={(event) =>
                  setNewTeamMember({ ...newTeamMember, email: event.target.value })
                }
                placeholder="อีเมล"
                className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-black"
              />
              <button
                type="button"
                onClick={addTeamMember}
                className="rounded-xl bg-black px-5 py-3 font-semibold text-white transition hover:bg-zinc-800 md:col-span-2"
              >
                บันทึกทีมงาน
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              {teamMembers.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-zinc-900">
                            {member.name}
                          </h3>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              member.active === false
                                ? "bg-zinc-100 text-zinc-500"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {member.active === false ? "พักใช้งาน" : "พร้อมใช้งาน"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-zinc-600">
                          {member.role}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {[member.phone, member.email].filter(Boolean).join(" • ") || "-"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleTeamMember(member.id)}
                          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                        >
                          {member.active === false ? "เปิดใช้งาน" : "พักใช้งาน"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTeamMember(member.id)}
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-zinc-500">
                  ยังไม่มีทีมงานที่บันทึกไว้
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Booking Number
              </p>
              <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                เลขที่การจอง / บาร์โค้ด
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                กำหนดเลขสำหรับใบจองถัดไปเพียงครั้งเดียว เมื่อบันทึกใบจองใหม่แล้ว ระบบจะล้างค่านี้และกลับไปสร้างเลขอัตโนมัติ
              </p>
            </div>

            <div className="mb-5 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => applyBookingNumberMode("auto")}
                className={`rounded-2xl border p-5 text-left transition ${
                  bookingNumberMode === "auto"
                    ? "border-black bg-black text-white shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border ${
                      bookingNumberMode === "auto"
                        ? "border-white"
                        : "border-zinc-400"
                    }`}
                  >
                    {bookingNumberMode === "auto" && (
                      <span className="h-2.5 w-2.5 rounded-full bg-white" />
                    )}
                  </span>
                  <div>
                    <h3 className="font-bold">
                      ระบบกำลังใช้เลขที่การจองอัตโนมัติ
                    </h3>
                    <p
                      className={`mt-1 text-sm ${
                        bookingNumberMode === "auto"
                          ? "text-zinc-300"
                          : "text-zinc-500"
                      }`}
                    >
                      ระบบจะสร้างเลขที่การจองถัดไปให้อัตโนมัติ
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => applyBookingNumberMode("custom")}
                className={`rounded-2xl border p-5 text-left transition ${
                  bookingNumberMode === "custom"
                    ? "border-black bg-black text-white shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border ${
                      bookingNumberMode === "custom"
                        ? "border-white"
                        : "border-zinc-400"
                    }`}
                  >
                    {bookingNumberMode === "custom" && (
                      <span className="h-2.5 w-2.5 rounded-full bg-white" />
                    )}
                  </span>
                  <div>
                    <h3 className="font-bold">
                      ระบบกำลังใช้เลขที่การจองแบบกำหนดเอง
                    </h3>
                    <p
                      className={`mt-1 text-sm ${
                        bookingNumberMode === "custom"
                          ? "text-zinc-300"
                          : "text-zinc-500"
                      }`}
                    >
                      กำหนดเลขที่การจองสำหรับใบจองถัดไปด้วยตนเอง
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
              <label className="mb-2 block text-sm font-semibold text-zinc-700">
                เลขที่ต้องการใช้
              </label>

              <input
                type="text"
                value={customBookingNumber}
                onChange={(event) => {
                  const nextValue = normalizeBookingNumber(event.target.value);
                  setCustomBookingNumber(nextValue);

                  if (bookingNumberMode === "custom") {
                    if (nextValue) {
                      localStorage.setItem(
                        CUSTOM_BOOKING_NUMBER_KEY,
                        nextValue
                      );
                    } else {
                      localStorage.removeItem(CUSTOM_BOOKING_NUMBER_KEY);
                    }

                    notifyBookingNumberUpdated("custom", nextValue);
                  }
                }}
                placeholder="เช่น BK-20260626-010"
                disabled={bookingNumberMode !== "custom"}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-lg font-semibold outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              />

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={saveCustomBookingNumber}
                  className="rounded-xl bg-black px-5 py-3 font-semibold text-white transition hover:bg-zinc-800"
                >
                  {bookingNumberMode === "auto"
                    ? "ใช้เลขอัตโนมัติ"
                    : "บันทึกเลขที่กำหนดเอง"}
                </button>

                <button
                  type="button"
                  onClick={clearCustomBookingNumber}
                  disabled={!customBookingNumber && !savedBookingNumber}
                  className="rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  กลับไปใช้เลขอัตโนมัติ
                </button>

                <button
                  type="button"
                  onClick={resetBarcodeSettings}
                  className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 font-semibold text-red-600 transition hover:bg-red-100"
                >
                  รีเซ็ตการตั้งค่า
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5">
              <p className="text-sm text-zinc-500">สถานะปัจจุบัน</p>
              <p className="mt-1 text-lg font-bold text-zinc-900">
                {bookingNumberMode === "custom"
                  ? savedBookingNumber
                    ? `ระบบกำลังใช้เลขที่การจองแบบกำหนดเอง: ${savedBookingNumber}`
                    : "เลือกโหมดกำหนดเองแล้ว กรุณากรอกเลขและกดบันทึก"
                  : "ระบบกำลังใช้เลขที่การจองอัตโนมัติ"}
              </p>
            </div>

            <section className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">
                    ประวัติการตั้งค่าบาร์โค้ด
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    ดูการเปลี่ยนแปลงย้อนหลังและนำเลขเดิมกลับมาใช้ใหม่ได้
                  </p>
                </div>

                <button
                  type="button"
                  onClick={clearHistory}
                  disabled={bookingNumberHistory.length === 0}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ล้างประวัติ
                </button>
              </div>

              {bookingNumberHistory.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {bookingNumberHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-4 px-5 py-4 transition hover:bg-zinc-50 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              item.mode === "custom"
                                ? "bg-zinc-900 text-white"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {item.mode === "custom"
                              ? "กำหนดเอง"
                              : "อัตโนมัติ"}
                          </span>

                          {item.bookingNumber && (
                            <span className="font-mono text-sm font-bold text-zinc-900">
                              {item.bookingNumber}
                            </span>
                          )}
                        </div>

                        <p className="mt-2 font-semibold text-zinc-800">
                          {item.action}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {item.createdAtText}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => reuseHistoryItem(item)}
                          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
                        >
                          นำกลับมาใช้
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteHistoryItem(item.id)}
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-zinc-500">
                  ยังไม่มีประวัติการตั้งค่าบาร์โค้ด
                </div>
              )}
            </section>
          </section>
        )}
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
          กำลังโหลดการตั้งค่า...
        </main>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}

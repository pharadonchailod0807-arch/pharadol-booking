"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

const ADMIN_USERS_KEY = "central_admin_users";
const ADMIN_SETTINGS_KEY = "central_admin_settings";
const ADMIN_LOG_KEY = "central_admin_activityLog";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const defaultUsers = [
  {
    id: "admin-1",
    name: "ผู้ดูแลระบบ",
    username: "Admin",
    password: "1234",
    role: "ADMIN",
    brands: ["adisorn", "pharadol"],
    active: true,
  },
];

const normalizeUsers = (value) => {
  const source = Array.isArray(value) && value.length ? value : defaultUsers;
  const hasAdmin = source.some(
    (user) =>
      user.id === "admin-1" ||
      String(user.username || "").trim().toLowerCase() === "super admin" ||
      String(user.username || "").trim().toLowerCase() === "admin"
  );
  const users = hasAdmin ? source : [...source, ...defaultUsers];

  return users.map((user) => {
    const role = user.role === "super_admin" ? "ADMIN" : user.role;
    const isAdmin =
      user.id === "admin-1" ||
      role === "ADMIN" ||
      String(user.username || "").trim().toLowerCase() === "super admin" ||
      String(user.username || "").trim().toLowerCase() === "admin";

    return {
      ...user,
      username:
        isAdmin &&
        String(user.username || "").trim().toLowerCase() === "super admin"
          ? "Admin"
          : user.username,
      role,
      active:
        typeof user.active === "boolean"
          ? user.active
          : typeof user.isActive === "boolean"
            ? user.isActive
            : true,
      brands:
        isAdmin
          ? ["adisorn", "pharadol"]
          : Array.isArray(user.brands)
            ? user.brands
            : user.brandId
              ? [user.brandId]
              : [],
    };
  });
};

const defaultSettings = {
  systemName: "Pharadol Booking Central",
  ownerName: "ผู้ดูแลระบบ",
  email: "",
  phone: "",
  adisornName: "Adisorn Wedding Studio",
  pharadolName: "PHARADOL PRODUCTION",
  adisornEnabled: true,
  pharadolEnabled: true,
};

const normalizeSettings = (value) => {
  const nextSettings = value ? { ...defaultSettings, ...value } : defaultSettings;

  if (
    !nextSettings.pharadolName ||
    nextSettings.pharadolName === "Pharadol Studio" ||
    nextSettings.pharadolName === "Pharadol Wedding Studio"
  ) {
    return {
      ...nextSettings,
      pharadolName: defaultSettings.pharadolName,
    };
  }

  return nextSettings;
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [users, setUsers] = useState(defaultUsers);
  const [settings, setSettings] = useState(defaultSettings);
  const [activityLog, setActivityLog] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const restoreInputRef = useRef(null);
  const [newUser, setNewUser] = useState({
    name: "",
    username: "",
    password: "",
    role: "STAFF",
    brands: ["adisorn"],
  });

  useEffect(() => {
    const loadAdminData = () => {
      const savedUsers = JSON.parse(
        localStorage.getItem(ADMIN_USERS_KEY) || "null"
      );
      const savedSettings = JSON.parse(
        localStorage.getItem(ADMIN_SETTINGS_KEY) || "null"
      );
      const savedLog = JSON.parse(
        localStorage.getItem(ADMIN_LOG_KEY) || "[]"
      );

      const normalizedUsers = normalizeUsers(savedUsers);
      localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(normalizedUsers));
      setUsers(normalizedUsers);
      const normalizedSettings = normalizeSettings(savedSettings);
      localStorage.setItem(
        ADMIN_SETTINGS_KEY,
        JSON.stringify(normalizedSettings)
      );
      setSettings(normalizedSettings);
      setActivityLog(Array.isArray(savedLog) ? savedLog : []);
    };

    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const savedCurrentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const rawUsers = JSON.parse(
          localStorage.getItem(ADMIN_USERS_KEY) || "null"
        );
        const savedUsers = normalizeUsers(rawUsers);
        localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(savedUsers));
        const latestAccount = savedUsers.find(
          (user) =>
            user.id === savedCurrentUser?.id ||
            String(user.username || "").trim().toLowerCase() ===
              String(savedCurrentUser?.username || "").trim().toLowerCase()
        );
        const lastActivity = Number(
          sessionStorage.getItem("lastActivity") || Date.now()
        );
        const sessionExpired = Date.now() - lastActivity > SESSION_TIMEOUT_MS;
        const accountIsActive = latestAccount?.active === true;
        const accountIsAdmin = latestAccount?.role === "ADMIN";

        if (
          !loggedIn ||
          !savedCurrentUser ||
          !accountIsActive ||
          !accountIsAdmin ||
          sessionExpired
        ) {
          sessionStorage.clear();
          window.location.replace("/login");
          return false;
        }

        const nextCurrentUser = {
          ...savedCurrentUser,
          ...latestAccount,
        };

        sessionStorage.setItem("currentUser", JSON.stringify(nextCurrentUser));
        sessionStorage.setItem("lastActivity", String(Date.now()));
        setCurrentUser(nextCurrentUser);
        setIsAuthorized(true);
        loadAdminData();
        return true;
      } catch (error) {
        console.error("Cannot load central admin data", error);
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
      if (
        event.key === ADMIN_USERS_KEY ||
        event.key === ADMIN_SETTINGS_KEY ||
        event.key === ADMIN_LOG_KEY
      ) {
        verifyAccess();
      }
    };

    const handleFocus = () => {
      verifyAccess();
    };

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(sessionCheck);
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const saveUsers = (nextUsers) => {
    const normalizedUsers = normalizeUsers(nextUsers);

    setUsers(normalizedUsers);
    localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(normalizedUsers));
    return normalizedUsers;
  };

  const saveSettings = (nextSettings) => {
    setSettings(nextSettings);
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(nextSettings));
  };

  const addActivity = (message) => {
    const createdAt = new Date().toISOString();
    const nextLog = [
      {
        id: `${createdAt}-${activityLog.length}`,
        message,
        createdAt,
      },
      ...activityLog,
    ].slice(0, 100);

    setActivityLog(nextLog);
    localStorage.setItem(ADMIN_LOG_KEY, JSON.stringify(nextLog));
  };

  const systems = useMemo(
    () => [
      {
        id: "adisorn",
        logo: "/adisorn-logo.png",
        name: settings.adisornName,
        description: "ระบบใบจอง ลูกค้า การชำระเงิน และคลังเอกสาร",
        href: "/adisorn",
        enabled: settings.adisornEnabled,
      },
      {
        id: "pharadol",
        logo: "/pharadol-logo.jpeg",
        name: settings.pharadolName,
        description:
          "ระบบใบจอง ลูกค้า การชำระเงิน และคลังเอกสารสำหรับ PHARADOL PRODUCTION",
        href: "/pharadol",
        enabled: settings.pharadolEnabled,
      },
    ],
    [settings]
  );

  const addUser = () => {
    if (!newUser.name.trim() || !newUser.username.trim() || !newUser.password) {
      window.alert("กรุณากรอกชื่อผู้ใช้ ชื่อเข้าสู่ระบบ และรหัสผ่านให้ครบ");
      return;
    }

    if (
      users.some(
        (user) =>
          String(user.username || "").trim().toLowerCase() ===
          newUser.username.trim().toLowerCase()
      )
    ) {
      window.alert("ชื่อเข้าสู่ระบบนี้ถูกใช้งานแล้ว");
      return;
    }

    if (newUser.role === "STAFF" && newUser.brands.length !== 1) {
      window.alert("พนักงานต้องได้รับสิทธิ์เพียงหนึ่งแบรนด์เท่านั้น");
      return;
    }

    const createdAt = new Date().toISOString();
    const nextUser = {
      id: `user-${newUser.username.trim().toLowerCase()}-${users.length}-${createdAt}`,
      name: newUser.name.trim(),
      username: newUser.username.trim(),
      password: newUser.password,
      role: newUser.role,
      brands:
        newUser.role === "ADMIN"
          ? ["adisorn", "pharadol"]
          : [newUser.brands[0]],
      active: true,
    };

    saveUsers([...users, nextUser]);
    addActivity(`เพิ่มผู้ใช้ ${nextUser.name}`);
    setNewUser({
      name: "",
      username: "",
      password: "",
      role: "STAFF",
      brands: ["adisorn"],
    });
  };

  const toggleUser = (id) => {
    const target = users.find((user) => user.id === id);
    if (!target) return;

    if (target.id === currentUser?.id && target.active) {
      window.alert("ไม่สามารถระงับบัญชีที่กำลังใช้งานอยู่ได้");
      return;
    }
    const nextUsers = users.map((user) =>
      user.id === id ? { ...user, active: !user.active } : user
    );
    saveUsers(nextUsers);
    addActivity(`${target?.active ? "ระงับ" : "เปิดใช้งาน"}ผู้ใช้ ${target?.name}`);
  };

  const editUsername = (id) => {
    const target = users.find((user) => user.id === id);
    if (!target) return;

    const nextUsername = window.prompt(
      `แก้ไข Username ของ ${target.name}`,
      target.username || ""
    );
    if (nextUsername === null) return;

    const normalizedUsername = nextUsername.trim();
    if (!normalizedUsername) {
      window.alert("Username ต้องไม่เป็นค่าว่าง");
      return;
    }

    const duplicateUsername = users.some(
      (user) =>
        user.id !== id &&
        String(user.username || "").trim().toLowerCase() ===
          normalizedUsername.toLowerCase()
    );

    if (duplicateUsername) {
      window.alert("Username นี้ถูกใช้งานแล้ว");
      return;
    }

    const nextUsers = users.map((user) =>
      user.id === id
        ? {
            ...user,
            username: normalizedUsername,
          }
        : user
    );
    const savedUsers = saveUsers(nextUsers);
    const savedUser = savedUsers.find((user) => user.id === id);

    addActivity(`แก้ไข Username ของ ${target.name}`);

    if (currentUser?.id === id) {
      const nextCurrentUser = {
        ...currentUser,
        ...(savedUser || {}),
        username: savedUser?.username || normalizedUsername,
      };
      setCurrentUser(nextCurrentUser);
      sessionStorage.setItem("currentUser", JSON.stringify(nextCurrentUser));
    }

    window.alert("แก้ไข Username เรียบร้อยแล้ว");
  };

  const editPassword = (id) => {
    const target = users.find((user) => user.id === id);
    if (!target) return;

    const nextPassword = window.prompt(
      `ตั้ง Password ใหม่สำหรับ ${target.name}`
    );
    if (nextPassword === null) return;

    const normalizedPassword = nextPassword.trim();
    if (!normalizedPassword) {
      window.alert("Password ต้องไม่เป็นค่าว่าง");
      return;
    }

    const confirmPassword = window.prompt(
      `ยืนยัน Password ใหม่สำหรับ ${target.name}`
    );
    if (confirmPassword === null) return;

    if (normalizedPassword !== confirmPassword.trim()) {
      window.alert("Password ทั้งสองครั้งไม่ตรงกัน");
      return;
    }

    const nextUsers = users.map((user) =>
      user.id === id
        ? {
            ...user,
            password: normalizedPassword,
          }
        : user
    );
    const savedUsers = saveUsers(nextUsers);
    const savedUser = savedUsers.find((user) => user.id === id);

    addActivity(`เปลี่ยน Password ของ ${target.name}`);

    if (currentUser?.id === id && savedUser) {
      const nextCurrentUser = {
        ...currentUser,
        ...savedUser,
      };
      setCurrentUser(nextCurrentUser);
      sessionStorage.setItem("currentUser", JSON.stringify(nextCurrentUser));
    }

    window.alert("เปลี่ยน Password เรียบร้อยแล้ว");
  };

  const deleteUser = (id) => {
    const target = users.find((user) => user.id === id);
    if (!target) return;

    if (target.id === currentUser?.id) {
      window.alert("ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้");
      return;
    }
    if (target?.role === "ADMIN" && users.filter((u) => u.role === "ADMIN").length === 1) {
      window.alert("ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้");
      return;
    }

    if (!window.confirm(`ต้องการลบผู้ใช้ ${target?.name} ใช่หรือไม่?`)) return;
    saveUsers(users.filter((user) => user.id !== id));
    addActivity(`ลบผู้ใช้ ${target?.name}`);
  };

  const updateSetting = (key, value) => {
    saveSettings({ ...settings, [key]: value });
  };

  const exportBackup = () => {
    const backup = {
      createdAt: new Date().toISOString(),
      users,
      settings,
      activityLog,
      adisorn: Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.startsWith("adisorn"))
          .map((key) => [key, localStorage.getItem(key)])
      ),
      pharadol: Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.startsWith("pharadol"))
          .map((key) => [key, localStorage.getItem(key)])
      ),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pharadol-central-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    addActivity("ดาวน์โหลดไฟล์สำรองข้อมูลระบบ");
  };

  const restoreBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup || typeof backup !== "object") {
        throw new Error("รูปแบบไฟล์ไม่ถูกต้อง");
      }

      const confirmed = window.confirm(
        "การกู้คืนจะเขียนทับข้อมูลปัจจุบันทั้งหมด ต้องการดำเนินการต่อหรือไม่?"
      );
      if (!confirmed) return;

      if (Array.isArray(backup.users)) {
        localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(backup.users));
      }
      if (backup.settings && typeof backup.settings === "object") {
        localStorage.setItem(
          ADMIN_SETTINGS_KEY,
          JSON.stringify(backup.settings)
        );
      }
      if (Array.isArray(backup.activityLog)) {
        localStorage.setItem(
          ADMIN_LOG_KEY,
          JSON.stringify(backup.activityLog)
        );
      }

      [backup.adisorn, backup.pharadol].forEach((brandData) => {
        if (!brandData || typeof brandData !== "object") return;
        Object.entries(brandData).forEach(([key, value]) => {
          if (typeof value === "string") {
            localStorage.setItem(key, value);
          }
        });
      });

      addActivity("กู้คืนข้อมูลระบบจากไฟล์สำรอง");
      window.alert("กู้คืนข้อมูลเรียบร้อยแล้ว ระบบจะโหลดใหม่");
      window.location.reload();
    } catch (error) {
      console.error("Cannot restore backup", error);
      window.alert("ไม่สามารถกู้คืนข้อมูลได้ กรุณาตรวจสอบไฟล์สำรอง");
    }
  };

  const logout = () => {
    if (!window.confirm("ต้องการออกจากระบบใช่หรือไม่?")) return;

    sessionStorage.clear();
    window.location.replace("/login");
  };

  const enterSystem = (system) => {
    if (!system.enabled) {
      window.alert("ระบบนี้ยังไม่เปิดใช้งาน");
      return;
    }

    if (currentUser?.role !== "ADMIN") {
      window.alert("คุณไม่มีสิทธิ์เข้าสู่ระบบนี้");
      window.location.replace("/login");
      return;
    }
    sessionStorage.setItem("lastActivity", String(new Date().getTime()));
    sessionStorage.setItem("activeBrand", system.id);
    window.location.replace(system.href);
  };

  const tabs = [
    ["overview", "ภาพรวม"],
    ["users", "ผู้ใช้งานและรหัสผ่าน"],
    ["brands", "ข้อมูลแบรนด์"],
    ["backup", "สำรองข้อมูล"],
    ["activity", "ประวัติการแก้ไข"],
  ];

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[32px] bg-zinc-950 px-6 py-8 text-white shadow-2xl sm:px-10 sm:py-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-zinc-400">
                {currentUser?.username || "Admin"}
              </p>
              <h1 className="text-3xl font-black sm:text-5xl">{settings.systemName}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
                ศูนย์ควบคุมผู้ใช้งาน รหัสผ่าน ข้อมูลแบรนด์ การสำรองข้อมูล และการตั้งค่าระบบทั้งหมด
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-zinc-300">
                <p className="font-semibold text-white">ผู้ดูแลระบบสูงสุด</p>
                <p className="mt-1">
                  {currentUser?.name || settings.ownerName || "ผู้ดูแลระบบ"}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </section>

        <nav className="mt-6 flex flex-wrap gap-2 rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                activeTab === value
                  ? "bg-zinc-950 text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <section className="mt-6">
            <div className="grid gap-5 md:grid-cols-2">
              {systems.map((system) => (
                <article
                  key={system.id}
                  className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    {system.logo ? (
                      <div className="relative h-20 w-44 overflow-hidden rounded-2xl border border-zinc-200 bg-[#552b0d] shadow-sm sm:h-24 sm:w-56">
                        <Image
                          src={system.logo}
                          alt={`${system.name} logo`}
                          fill
                          priority={system.id === "adisorn"}
                          className="object-contain p-3"
                          sizes="(max-width: 640px) 176px, 224px"
                        />
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-950 text-xl font-black text-white">
                        {system.name.charAt(0)}
                      </div>
                    )}
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        system.enabled
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-zinc-200 text-zinc-600"
                      }`}
                    >
                      {system.enabled ? "พร้อมใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </div>
                  <h2 className="mt-6 text-2xl font-black">{system.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    {system.description}
                  </p>
                  {system.enabled ? (
                    <button
                      type="button"
                      onClick={() => enterSystem(system)}
                      className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-zinc-950 px-5 py-3.5 font-bold text-white"
                    >
                      เข้าสู่ระบบ
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="mt-6 w-full rounded-2xl bg-zinc-200 px-5 py-3.5 font-bold text-zinc-500"
                    >
                      ยังไม่เปิดใช้งาน
                    </button>
                  )}
                </article>
              ))}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-4">
              {[
                [users.length, "จำนวนผู้ใช้"],
                [users.filter((user) => user.active).length, "ผู้ใช้ที่เปิดใช้งาน"],
                [systems.filter((system) => system.enabled).length, "แบรนด์ที่เปิดใช้งาน"],
                [activityLog.length, "รายการแก้ไขล่าสุด"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-3xl font-black">{value}</p>
                  <p className="mt-1 text-sm text-zinc-500">{label}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "users" && (
          <section className="mt-6 grid gap-6 xl:grid-cols-[380px_1fr]">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">เพิ่มผู้ใช้งาน</h2>
              <div className="mt-5 space-y-4">
                <input
                  value={newUser.name}
                  onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
                  placeholder="ชื่อผู้ใช้งาน"
                  className="w-full rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-950"
                />
                <input
                  value={newUser.username}
                  onChange={(event) =>
                    setNewUser({ ...newUser, username: event.target.value })
                  }
                  placeholder="ชื่อเข้าสู่ระบบ"
                  className="w-full rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-950"
                />
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(event) =>
                    setNewUser({ ...newUser, password: event.target.value })
                  }
                  placeholder="รหัสผ่าน"
                  className="w-full rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-950"
                />
                <select
                  value={newUser.role}
                  onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}
                  className="w-full rounded-2xl border border-zinc-300 px-4 py-3"
                >
                  <option value="ADMIN">ผู้ดูแลระบบ</option>
                  <option value="STAFF">พนักงาน</option>
                </select>
                <div className="space-y-2 text-sm">
                  {["adisorn", "pharadol"].map((brand) => (
                    <label key={brand} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={
                          newUser.role === "ADMIN"
                            ? true
                            : newUser.brands.includes(brand)
                        }
                        disabled={newUser.role === "ADMIN"}
                        onChange={(event) => {
                          if (newUser.role === "ADMIN") {
                            // do nothing, admin always has both brands
                            return;
                          }
                          if (event.target.checked) {
                            setNewUser({
                              ...newUser,
                              brands: [brand],
                            });
                          } else {
                            setNewUser({
                              ...newUser,
                              brands: [],
                            });
                          }
                        }}
                      />
                      เข้าถึง {brand}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addUser}
                  className="w-full rounded-2xl bg-zinc-950 px-5 py-3 font-bold text-white"
                >
                  เพิ่มผู้ใช้งาน
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 p-6">
                <h2 className="text-xl font-black">รายชื่อผู้ใช้งาน</h2>
              </div>
              <div className="divide-y divide-zinc-200">
                {users.map((user) => (
                  <div key={user.id} className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black">{user.name}</h3>
                          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold">
                            {user.role}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                              user.active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {user.active ? "เปิดใช้งาน" : "ระงับ"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-500">@{user.username}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          สิทธิ์: {user.brands.join(", ") || "ไม่มี"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => editUsername(user.id)}
                          className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-semibold"
                        >
                          แก้ไข Username
                        </button>
                        <button
                          type="button"
                          onClick={() => editPassword(user.id)}
                          className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-semibold"
                        >
                          เปลี่ยน Password
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleUser(user.id)}
                          className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-700"
                        >
                          {user.active ? "ระงับ" : "เปิดใช้งาน"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteUser(user.id)}
                          className="rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-700"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "brands" && (
          <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">ข้อมูลระบบและแบรนด์</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {[
                ["systemName", "ชื่อระบบกลาง"],
                ["ownerName", "ชื่อผู้ดูแลระบบ"],
                ["email", "อีเมล"],
                ["phone", "เบอร์โทรศัพท์"],
                ["adisornName", "ชื่อแบรนด์ Adisorn"],
                ["pharadolName", "ชื่อแบรนด์ Pharadol"],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-700">
                    {label}
                  </span>
                  <input
                    value={settings[key]}
                    onChange={(event) => updateSetting(key, event.target.value)}
                    className="w-full rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-950"
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ["adisornEnabled", "เปิดใช้งานระบบ Adisorn"],
                ["pharadolEnabled", "เปิดใช้งานระบบ Pharadol"],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"
                >
                  <span className="font-semibold">{label}</span>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(event) => {
                      updateSetting(key, event.target.checked);
                      addActivity(`${event.target.checked ? "เปิด" : "ปิด"}ใช้งาน ${label}`);
                    }}
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        {activeTab === "backup" && (
          <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">สำรองข้อมูลระบบทั้งหมด</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              ดาวน์โหลดข้อมูลผู้ใช้ การตั้งค่าระบบ ประวัติการแก้ไข และข้อมูลของทุกแบรนด์เป็นไฟล์ JSON
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportBackup}
                className="rounded-2xl bg-zinc-950 px-6 py-3 font-bold text-white"
              >
                ดาวน์โหลดไฟล์สำรองข้อมูล
              </button>
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                className="rounded-2xl border border-zinc-300 bg-white px-6 py-3 font-bold text-zinc-800 transition hover:bg-zinc-50"
              >
                กู้คืนข้อมูลจากไฟล์
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json"
                onChange={restoreBackup}
                className="hidden"
              />
            </div>
          </section>
        )}

        {activeTab === "activity" && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 p-6">
              <h2 className="text-xl font-black">ประวัติการแก้ไขระบบ</h2>
            </div>
            {activityLog.length ? (
              <div className="divide-y divide-zinc-200">
                {activityLog.map((item) => (
                  <div key={item.id} className="p-5">
                    <p className="font-semibold">{item.message}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(item.createdAt).toLocaleString("th-TH")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-zinc-500">ยังไม่มีประวัติการแก้ไข</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

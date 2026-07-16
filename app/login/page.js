"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const ADMIN_USERS_KEY = "central_admin_users";
const ADMIN_USER_OVERRIDES_KEY = "central_admin_user_overrides";
const ADMIN_USERS_TABLE = "admin_users";
const LOGIN_USERNAME_HISTORY_KEY = "login_username_history";
const DEFAULT_LOGIN_USERNAME_OPTIONS = [];
const MAX_LOGIN_USERNAME_HISTORY = 8;
const ADMIN_USERNAME_ALIASES = ["admin", "super admin"];

const DEFAULT_ACCOUNTS = [
  {
    id: "admin-1",
    name: "ผู้ดูแลระบบ",
    username: "Admin",
    password: "1234",
    role: "ADMIN",
    brands: ["adisorn", "pharadol"],
    active: true,
  },
  {
    id: "pharadol-1",
    name: "PHARADOL PRODUCTION",
    username: "pharadol",
    password: "1234",
    role: "STAFF",
    brands: ["pharadol"],
    active: true,
  },
  {
    id: "adisorn-1",
    name: "Adisorn Wedding Studio",
    username: "adisorn",
    password: "1234",
    role: "STAFF",
    brands: ["adisorn"],
    active: true,
  },
];

const userToRow = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  password: user.password,
  role: user.role,
  brands: Array.isArray(user.brands) ? user.brands : [],
  active: user.active !== false,
  updated_at: new Date().toISOString(),
});

const rowToUser = (row) => ({
  id: row.id,
  name: row.name,
  username: row.username,
  password: row.password,
  role: row.role,
  brands: Array.isArray(row.brands) ? row.brands : [],
  active: row.active !== false,
});

const clearUserOverrides = () => {
  localStorage.removeItem(ADMIN_USER_OVERRIDES_KEY);
};

const normalizeAccounts = (value, { applyOverrides = true } = {}) => {
  const savedAccounts = Array.isArray(value) ? value : [];
  const savedOverrides = applyOverrides
    ? (() => {
        try {
          const overrides = JSON.parse(
            localStorage.getItem(ADMIN_USER_OVERRIDES_KEY) || "{}"
          );

          return overrides && typeof overrides === "object" ? overrides : {};
        } catch (error) {
          console.error("Cannot read admin user overrides", error);
          return {};
        }
      })()
    : {};
  const source = [...savedAccounts];

  DEFAULT_ACCOUNTS.forEach((defaultAccount) => {
    const existingIndex = source.findIndex(
      (user) =>
        user.id === defaultAccount.id ||
        String(user.username || "").trim().toLowerCase() ===
          String(defaultAccount.username || "").trim().toLowerCase()
    );

    if (existingIndex === -1) {
      source.push(defaultAccount);
      return;
    }

    const existingAccount = source[existingIndex];
    const override = savedOverrides[defaultAccount.id] || {};

    source[existingIndex] = {
      ...defaultAccount,
      ...existingAccount,
      ...override,
      id: defaultAccount.id,
      username:
        override.username ||
        (defaultAccount.id === "admin-1" &&
        String(existingAccount.username || "").trim().toLowerCase() ===
          "super admin"
          ? "Admin"
          : existingAccount.username || defaultAccount.username),
      role: defaultAccount.role,
      brands: defaultAccount.brands,
      active:
        typeof override.active === "boolean"
          ? override.active
          : typeof existingAccount.active === "boolean"
            ? existingAccount.active
            : true,
    };
  });

  Object.entries(savedOverrides).forEach(([id, override]) => {
    if (!override || typeof override !== "object") return;

    const existingIndex = source.findIndex((user) => user.id === id);

    if (existingIndex !== -1) {
      source[existingIndex] = {
        ...source[existingIndex],
        ...override,
        id,
        active:
          typeof override.active === "boolean"
            ? override.active
            : source[existingIndex].active,
      };
      return;
    }

    if (id === "admin-1") {
      source.push({
        ...DEFAULT_ACCOUNTS[0],
        ...override,
        id,
        role: "ADMIN",
        brands: ["adisorn", "pharadol"],
        active:
          typeof override.active === "boolean" ? override.active : true,
      });
    }
  });

  return source.map((user) => ({
    ...user,
    role: user.role === "super_admin" ? "ADMIN" : user.role,
    active:
      typeof user.active === "boolean"
        ? user.active
        : typeof user.isActive === "boolean"
          ? user.isActive
          : true,
    brands:
      user.role === "ADMIN" || user.role === "super_admin"
        ? ["adisorn", "pharadol"]
        : Array.isArray(user.brands)
          ? user.brands
              .map((brand) => (brand === "pharadon" ? "pharadol" : brand))
              .filter((brand) => ["adisorn", "pharadol"].includes(brand))
          : user.brandId
            ? [user.brandId === "pharadon" ? "pharadol" : user.brandId].filter(
                (brand) => ["adisorn", "pharadol"].includes(brand)
              )
            : [],
  }));
};

const saveUsersLocally = (users) => {
  localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users));
};

const normalizeUsernameHistory = (value) => {
  const items = Array.isArray(value) ? value : [];
  const normalizedItems = [];
  const seen = new Set();

  items.forEach((item) => {
    const username = String(item || "").trim();
    const key = username.toLowerCase();

    if (!username || seen.has(key)) return;

    seen.add(key);
    normalizedItems.push(username);
  });

  DEFAULT_LOGIN_USERNAME_OPTIONS.forEach((username) => {
    const key = username.toLowerCase();

    if (seen.has(key)) return;

    seen.add(key);
    normalizedItems.push(username);
  });

  return normalizedItems.slice(0, MAX_LOGIN_USERNAME_HISTORY);
};

const syncUsersToSupabase = async (users) => {
  const { error } = await supabase
    .from(ADMIN_USERS_TABLE)
    .upsert(users.map(userToRow), { onConflict: "id" });

  if (error) {
    console.error("Cannot sync admin users to Supabase", error);
  }
};

const loadUsers = async () => {
  const savedUsers = JSON.parse(localStorage.getItem(ADMIN_USERS_KEY) || "null");
  const localUsers = normalizeAccounts(savedUsers);
  saveUsersLocally(localUsers);

  try {
    const { data, error } = await supabase
      .from(ADMIN_USERS_TABLE)
      .select("*")
      .order("username", { ascending: true });

    if (error) throw error;

    const remoteUsers = Array.isArray(data) ? data.map(rowToUser) : [];

    if (remoteUsers.length > 0) {
      const normalizedRemoteUsers = normalizeAccounts(remoteUsers, {
        applyOverrides: false,
      });
      clearUserOverrides();
      saveUsersLocally(normalizedRemoteUsers);
      return normalizedRemoteUsers;
    }

    await syncUsersToSupabase(localUsers);
  } catch (error) {
    console.error("Cannot load admin users from Supabase", error);
  }

  return localUsers;
};

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameHistory, setUsernameHistory] = useState([]);
  const [isUsernameHistoryOpen, setIsUsernameHistoryOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedHistory = JSON.parse(
          localStorage.getItem(LOGIN_USERNAME_HISTORY_KEY) || "[]"
        );
        const nextHistory = normalizeUsernameHistory(savedHistory);

        setUsernameHistory(nextHistory);
      } catch (error) {
        console.error("Cannot load login username history", error);
      }
    }, 0);

    try {
      loadUsers();
    } catch (error) {
      console.error("Cannot initialize login users", error);
      localStorage.setItem(
        ADMIN_USERS_KEY,
        JSON.stringify(DEFAULT_ACCOUNTS)
      );
    }

    return () => window.clearTimeout(timer);
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPassword = password;

    if (!normalizedUsername || !normalizedPassword) {
      setError("กรุณากรอก Username และ Password");
      setIsSubmitting(false);
      return;
    }

    try {
      const users = await loadUsers();

      const account = users.find(
        (user) =>
          (String(user.username || "").trim().toLowerCase() ===
            normalizedUsername ||
            (user.id === "admin-1" &&
              ADMIN_USERNAME_ALIASES.includes(normalizedUsername))) &&
          String(user.password || "") === normalizedPassword &&
          user.active === true
      );

      if (!account) {
        setError("Username หรือ Password ไม่ถูกต้อง หรือบัญชีถูกระงับ");
        setIsSubmitting(false);
        return;
      }

      const allowedBrands = Array.isArray(account.brands)
        ? account.brands
            .map((brand) => (brand === "pharadon" ? "pharadol" : brand))
            .filter((brand) => ["adisorn", "pharadol"].includes(brand))
        : [];

      const sessionUser = {
        id: account.id,
        name: account.name,
        username: account.username,
        role: account.role,
        brands: allowedBrands,
        active: account.active,
        loggedInAt: new Date().toISOString(),
      };

      const savedUsername = String(account.username || "").trim();
      const nextUsernameHistory = normalizeUsernameHistory([
        savedUsername,
        ...usernameHistory.filter(
          (item) => item.toLowerCase() !== savedUsername.toLowerCase()
        ),
      ]);

      localStorage.setItem(
        LOGIN_USERNAME_HISTORY_KEY,
        JSON.stringify(nextUsernameHistory)
      );
      setUsernameHistory(nextUsernameHistory);

      sessionStorage.clear();
      sessionStorage.setItem("loggedIn", "true");
      sessionStorage.setItem("currentUser", JSON.stringify(sessionUser));
      sessionStorage.setItem("lastActivity", String(Date.now()));

      if (account.role === "ADMIN") {
        sessionStorage.setItem("activeBrand", "admin");
        window.location.replace("/admin");
        return;
      }

      if (allowedBrands.length !== 1) {
        sessionStorage.clear();
        setError("บัญชีนี้ต้องได้รับสิทธิ์เพียงหนึ่งแบรนด์เท่านั้น");
        setIsSubmitting(false);
        return;
      }

      const activeBrand = allowedBrands[0];
      sessionStorage.setItem("activeBrand", activeBrand);
      window.location.replace(`/${activeBrand}/welcome`);
    } catch (error) {
      console.error("Login failed", error);
      sessionStorage.clear();
      setError("เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่");
      setIsSubmitting(false);
    }
  };

  const usernameSearch = username.trim().toLowerCase();
  const visibleUsernameHistory = [];

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b12] px-4 py-8 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,0.2),transparent_32%),radial-gradient(circle_at_82%_16%,rgba(99,102,241,0.16),transparent_30%),linear-gradient(135deg,#07111d_0%,#111827_48%,#020617_100%)]" />
        <div className="absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:52px_52px]" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(180deg,transparent,rgba(2,6,23,0.9))]" />
      </div>

      <form
        onSubmit={handleLogin}
        className="login-card relative z-10 w-full max-w-[480px] overflow-visible rounded-[28px] border border-white/12 bg-white/[0.075] px-6 py-8 text-center shadow-[0_28px_80px_rgba(0,0,0,0.52)] backdrop-blur-2xl sm:px-9 sm:py-9"
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.62),transparent)]" />
        <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_48%,rgba(255,255,255,0.035))]" />

        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-white/45">
            Secure Workspace
          </p>
          <h1 className="mt-4 text-[30px] font-black uppercase leading-[0.98] text-white sm:text-[42px]">
            STUDIO BOOKING
            <span className="block">MANAGEMENT</span>
          </h1>
        </div>

        <p className="relative mx-auto mt-3 max-w-[340px] text-sm font-medium leading-6 text-white/58">
          เข้าสู่พื้นที่ทำงานที่ได้รับอนุญาต
        </p>

        <div className="relative mx-auto mt-8 max-w-[380px] space-y-4">
          <div className="relative">
            <label className="mb-2 block text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-white/48">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setIsUsernameHistoryOpen(true);
                setError("");
              }}
              onFocus={() => setIsUsernameHistoryOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setIsUsernameHistoryOpen(false), 120);
              }}
              placeholder="Username"
              autoComplete="off"
              autoFocus
              className="h-[52px] w-full rounded-2xl border border-white/14 bg-white/[0.09] px-4 text-base font-semibold text-white outline-none transition placeholder:text-white/34 focus:border-white/70 focus:bg-white/[0.13] focus:shadow-[0_0_0_4px_rgba(255,255,255,0.1)]"
            />

            {isUsernameHistoryOpen && visibleUsernameHistory.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-white/14 bg-[#111827]/90 p-1.5 text-left shadow-[0_18px_45px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
                {visibleUsernameHistory.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setUsername(item);
                      setIsUsernameHistoryOpen(false);
                      setError("");
                    }}
                    className="block w-full rounded-[14px] px-4 py-2.5 text-left text-sm font-semibold text-white/88 transition hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white focus:outline-none"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-white/48">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              placeholder="Password"
              autoComplete="current-password"
              className="h-[52px] w-full rounded-2xl border border-white/14 bg-white/[0.09] px-4 text-base font-semibold text-white outline-none transition placeholder:text-white/34 focus:border-white/70 focus:bg-white/[0.13] focus:shadow-[0_0_0_4px_rgba(255,255,255,0.1)]"
            />
          </div>

          {error && (
            <p className="rounded-2xl border border-[#ff453a]/25 bg-[#ff453a]/10 px-4 py-3 text-center text-sm font-semibold text-[#ffb4ae]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="group relative inline-flex h-[52px] w-full items-center justify-center overflow-hidden rounded-2xl bg-white px-5 text-base font-black text-[#111827] shadow-[0_16px_38px_rgba(0,0,0,0.3)] transition duration-300 hover:-translate-y-0.5 hover:bg-zinc-100 hover:shadow-[0_20px_46px_rgba(0,0,0,0.4)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.65),transparent)]" />
            {isSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </div>
      </form>

      <style jsx>{`
        .login-card {
          animation: cardIn 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </main>
  );
}

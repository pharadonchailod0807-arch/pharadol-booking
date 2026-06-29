"use client";

import { useEffect, useState } from "react";

const ADMIN_USERS_KEY = "central_admin_users";
const LOGIN_USERNAME_HISTORY_KEY = "login_username_history";
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

const normalizeAccounts = (value) => {
  const savedAccounts = Array.isArray(value) ? value : [];
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

    source[existingIndex] = {
      ...defaultAccount,
      ...existingAccount,
      id: defaultAccount.id,
      username:
        defaultAccount.id === "admin-1" &&
        String(existingAccount.username || "").trim().toLowerCase() ===
          "super admin"
          ? "Admin"
          : existingAccount.username || defaultAccount.username,
      role: defaultAccount.role,
      brands: defaultAccount.brands,
      active:
        typeof existingAccount.active === "boolean"
          ? existingAccount.active
          : true,
    };
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

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameHistory, setUsernameHistory] = useState([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedHistory = JSON.parse(
          localStorage.getItem(LOGIN_USERNAME_HISTORY_KEY) || "[]"
        );
        const safeHistory = Array.isArray(savedHistory)
          ? savedHistory.filter((item) =>
              ["pharadol", "adisorn"].includes(String(item).toLowerCase())
            )
          : [];

        const defaultUsernames = ["Admin", "Super Admin", "pharadol", "adisorn"];
        const nextHistory = Array.from(
          new Set([
            ...safeHistory.map((item) => String(item).toLowerCase()),
            ...defaultUsernames,
          ])
        );

        setUsernameHistory(nextHistory);
      } catch (error) {
        console.error("Cannot load login username history", error);
      }
    }, 0);

    try {
      const savedUsers = JSON.parse(
        localStorage.getItem(ADMIN_USERS_KEY) || "null"
      );
      const normalizedUsers = normalizeAccounts(savedUsers);
      localStorage.setItem(
        ADMIN_USERS_KEY,
        JSON.stringify(normalizedUsers)
      );
    } catch (error) {
      console.error("Cannot initialize login users", error);
      localStorage.setItem(
        ADMIN_USERS_KEY,
        JSON.stringify(DEFAULT_ACCOUNTS)
      );
    }

    return () => window.clearTimeout(timer);
  }, []);

  const handleLogin = (event) => {
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
      const savedUsers = JSON.parse(
        localStorage.getItem(ADMIN_USERS_KEY) || "null"
      );
      const users = normalizeAccounts(savedUsers);
      localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users));

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
      const nextUsernameHistory = [
        savedUsername,
        ...usernameHistory.filter(
          (item) => item.toLowerCase() !== savedUsername.toLowerCase()
        ),
      ].slice(0, 8);

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
      window.location.replace(`/${activeBrand}/dashboard`);
    } catch (error) {
      console.error("Login failed", error);
      sessionStorage.clear();
      setError("เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080808] px-4 py-8 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(112,58,20,0.22),transparent_42%)]" />
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-fuchsia-500/15 blur-[125px]" />
        <div className="absolute -bottom-28 -right-20 h-[460px] w-[460px] rounded-full bg-blue-500/15 blur-[135px]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:42px_42px]" />
      </div>

      <form
        onSubmit={handleLogin}
        className="login-card relative z-10 w-full max-w-[470px] overflow-hidden rounded-[30px] border border-white/15 bg-white/[0.075] px-7 py-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:px-10 sm:py-10"
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-[#6f3512]/25 blur-3xl" />

        <h1 className="mt-2 text-3xl font-black uppercase leading-tight tracking-[-0.03em] text-white sm:text-4xl">
          STUDIO BOOKING
          <br />
          MANAGEMENT
        </h1>

        <p className="mt-3 text-sm text-white/55 sm:text-base">
          ระบบจัดการงานถ่ายภาพและวิดีโอ
        </p>

        <div className="mt-8 space-y-4">
          <input
            type="text"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setError("");
            }}
            placeholder="Username"
            autoComplete="username"
            autoFocus
            className="w-full rounded-2xl border border-white/15 bg-white/[0.08] px-5 py-4 text-base text-white outline-none transition placeholder:text-white/35 focus:border-[#d7a171]/70 focus:bg-white/[0.11] focus:shadow-[0_0_0_4px_rgba(215,161,113,0.08)]"
          />

          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full rounded-2xl border border-white/15 bg-white/[0.08] px-5 py-4 text-base text-white outline-none transition placeholder:text-white/35 focus:border-[#d7a171]/70 focus:bg-white/[0.11] focus:shadow-[0_0_0_4px_rgba(215,161,113,0.08)]"
          />

          {error && (
            <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-center text-sm font-semibold text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-2xl bg-white px-6 py-4 text-base font-black text-zinc-950 shadow-[0_12px_35px_rgba(255,255,255,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(255,255,255,0.2)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
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

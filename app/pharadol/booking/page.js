"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export default function BookingPage() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const normalizedBrands = Array.isArray(currentUser?.brands)
          ? currentUser.brands.map((brand) =>
              brand === "pharadon" ? "pharadol" : brand
            )
          : [];
        const isAdmin = currentUser?.role === "ADMIN";
        const hasBrandAccess = normalizedBrands.includes("pharadol");
        const accountIsActive = currentUser?.active !== false;
        const brandIsCorrect =
          activeBrand === "pharadol" && (isAdmin || hasBrandAccess);
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
        console.error("Cannot verify Pharadol booking access", error);
        sessionStorage.clear();
        window.location.replace("/login");
        return false;
      }
    };

    if (hasRedirectedRef.current) return;
    if (!verifyAccess()) return;

    hasRedirectedRef.current = true;
    window.location.replace("/pharadol");
  }, []);

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
      กำลังเปิดระบบใบจอง...
    </main>
  );
}
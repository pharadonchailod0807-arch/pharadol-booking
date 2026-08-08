"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
      console.error("Application render error detail", {
        pathname: window.location.pathname,
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        userAgent: window.navigator?.userAgent || "",
      });
    }

    console.error("Application render error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 text-center text-zinc-700">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-950">ไม่สามารถเปิดหน้านี้ได้</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          ระบบพบข้อผิดพลาดระหว่างโหลดหน้า กรุณาลองโหลดใหม่อีกครั้ง
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 min-h-11 rounded-xl bg-zinc-950 px-5 py-2 text-sm font-semibold text-white"
        >
          โหลดใหม่
        </button>
      </section>
    </main>
  );
}

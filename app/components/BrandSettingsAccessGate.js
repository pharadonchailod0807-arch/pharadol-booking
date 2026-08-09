"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrandTheme } from "@/app/lib/brandThemes";

const AUTO_LOCK_MINUTES = 15;
const SETTINGS_ACCESS = {
  pharadol: {
    pinKey: "pharadol_securityPin",
    unlockKey: "pharadol_settings_unlocked",
  },
  adisorn: {
    pinKey: "adisorn_securityPin",
    unlockKey: "adisorn_settings_unlocked",
  },
};

const getAccessConfig = (brandId) =>
  SETTINGS_ACCESS[brandId] || SETTINGS_ACCESS.pharadol;

const readStorageValue = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorageValue = (storage, key, value) => {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeStorageValue = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage failures so the settings route does not crash.
  }
};

export default function BrandSettingsAccessGate({ brandId, children }) {
  const router = useRouter();
  const theme = getBrandTheme(brandId);
  const { pinKey, unlockKey } = getAccessConfig(brandId);
  const [settingsAccessStatus, setSettingsAccessStatus] = useState("checking");
  const [pinInput, setPinInput] = useState("");
  const [message, setMessage] = useState("");

  const checkSettingsAccess = useCallback(() => {
    const savedPin = readStorageValue(localStorage, pinKey);
    const settingsUnlocked =
      readStorageValue(sessionStorage, unlockKey) === "true";

    if (!savedPin) {
      setSettingsAccessStatus("allowed");
      setMessage("");
      return;
    }

    if (settingsUnlocked) {
      setSettingsAccessStatus("allowed");
      setMessage("");
      return;
    }

    setSettingsAccessStatus("locked");
  }, [pinKey, unlockKey]);

  useEffect(() => {
    const initialCheckTimer = window.setTimeout(checkSettingsAccess, 0);

    const handleFocus = () => checkSettingsAccess();
    const handleStorage = (event) => {
      if (event.key === pinKey || event.key === unlockKey) {
        checkSettingsAccess();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearTimeout(initialCheckTimer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
    };
  }, [checkSettingsAccess, pinKey, unlockKey]);

  useEffect(() => {
    if (settingsAccessStatus !== "allowed") return undefined;
    if (!readStorageValue(localStorage, pinKey)) return undefined;

    let lockTimer;
    const resetLockTimer = () => {
      window.clearTimeout(lockTimer);
      lockTimer = window.setTimeout(() => {
        removeStorageValue(sessionStorage, unlockKey);
        setPinInput("");
        setSettingsAccessStatus("locked");
        setMessage("Settings ถูกล็อกอัตโนมัติ กรุณายืนยันสิทธิ์อีกครั้ง");
      }, AUTO_LOCK_MINUTES * 60 * 1000);
    };
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    resetLockTimer();
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, resetLockTimer, { passive: true })
    );

    return () => {
      window.clearTimeout(lockTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, resetLockTimer)
      );
    };
  }, [settingsAccessStatus, pinKey, unlockKey]);

  const unlockSettings = (event) => {
    event.preventDefault();
    const savedPin = readStorageValue(localStorage, pinKey);

    if (!savedPin) {
      setSettingsAccessStatus("allowed");
      setMessage("");
      return;
    }

    if (pinInput === savedPin) {
      const unlocked = writeStorageValue(sessionStorage, unlockKey, "true");
      if (!unlocked) {
        setMessage("ไม่สามารถบันทึกสถานะยืนยันสิทธิ์ได้ กรุณาลองใหม่อีกครั้ง");
        return;
      }
      setSettingsAccessStatus("allowed");
      setPinInput("");
      setMessage("");
      return;
    }

    setMessage("PIN ไม่ถูกต้อง กรุณาลองใหม่");
  };

  if (settingsAccessStatus === "checking") {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-4 text-center text-sm font-semibold"
        style={{ backgroundColor: theme.background, color: theme.muted }}
      >
        กำลังตรวจสอบสิทธิ์ Settings...
      </main>
    );
  }

  if (settingsAccessStatus === "locked") {
    return (
      <main
        className="min-h-screen px-4 py-8 sm:px-6 lg:px-8"
        style={{ backgroundColor: theme.background, color: theme.text }}
      >
        <section className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div
            className="w-full rounded-3xl border bg-white p-6 shadow-sm sm:p-8"
            style={{ borderColor: theme.border }}
          >
            <p className="text-xs font-black uppercase" style={{ color: theme.muted }}>
              Settings Authorization
            </p>
            <h1 className="mt-3 text-2xl font-black">
              ยืนยันสิทธิ์ Settings
            </h1>
            <p className="mt-2 text-sm font-semibold" style={{ color: theme.muted }}>
              กรอก PIN ความปลอดภัยเพื่อเข้าสู่หน้าตั้งค่าระบบ
            </p>

            <form onSubmit={unlockSettings} className="mt-6 space-y-4">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pinInput}
                onChange={(event) => {
                  setPinInput(event.target.value);
                  if (message) setMessage("");
                }}
                className="min-h-12 w-full rounded-2xl border bg-white px-4 text-base font-semibold outline-none transition focus:ring-2"
                style={{
                  borderColor: theme.border,
                  color: theme.text,
                  "--tw-ring-color": theme.accent,
                }}
                placeholder="กรอก PIN"
              />

              {message && (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                  {message}
                </p>
              )}

              <button
                type="submit"
                className="min-h-12 w-full rounded-2xl px-4 text-sm font-black text-white transition hover:opacity-90"
                style={{ backgroundColor: theme.buttonPrimary || theme.primary }}
              >
                ยืนยันสิทธิ์
              </button>
            </form>

            <button
              type="button"
              onClick={() => router.push(`/${brandId}/dashboard`)}
              className="mt-3 min-h-11 w-full rounded-2xl border bg-white px-4 text-sm font-bold transition hover:bg-zinc-50"
              style={{ borderColor: theme.border, color: theme.text }}
            >
              กลับ Dashboard
            </button>
          </div>
        </section>
      </main>
    );
  }

  return children;
}

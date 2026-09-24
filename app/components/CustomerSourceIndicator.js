"use client";

import { useMemo, useState } from "react";

export const CUSTOMER_SOURCE_OPTIONS = [
  { value: "facebook", label: "Facebook", color: "#2563EB" },
  { value: "instagram", label: "Instagram", color: "#C026D3" },
  { value: "tiktok", label: "TikTok", color: "#0891B2" },
  { value: "google_search", label: "Google / Search", color: "#1D4ED8" },
  { value: "friend_referral", label: "เพื่อนหรือคนรู้จักแนะนำ", color: "#7C3AED" },
  { value: "existing_customer_referral", label: "ลูกค้าเก่าแนะนำ", color: "#16A34A" },
  { value: "repeat_customer", label: "เคยใช้บริการมาก่อน", color: "#059669" },
  { value: "event_portfolio", label: "เห็นผลงานจากงานแต่ง/งานอีเวนต์", color: "#EA580C" },
  { value: "planner_organizer", label: "Wedding Planner / Organizer แนะนำ", color: "#B45309" },
  { value: "venue_referral", label: "สถานที่จัดงานแนะนำ", color: "#0D9488" },
  { value: "other", label: "อื่น ๆ", color: "#6B7280" },
];

export const CUSTOMER_SOURCE_VALUES = new Set(
  CUSTOMER_SOURCE_OPTIONS.map((option) => option.value)
);

export const getCustomerSourceOption = (source) =>
  CUSTOMER_SOURCE_OPTIONS.find((option) => option.value === source) || null;

const DEFAULT_SOURCE_COLOR = "#D4D4D8";

export default function CustomerSourceIndicator({
  customer,
  brandChrome,
  onChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingSource, setPendingSource] = useState("");
  const [otherDetail, setOtherDetail] = useState(
    customer?.customerSource === "other" ? customer?.customerSourceDetail || "" : ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedOption = getCustomerSourceOption(customer?.customerSource);
  const tooltip = useMemo(() => {
    if (!selectedOption) return "ยังไม่ได้ระบุช่องทาง";
    if (selectedOption.value !== "other") return selectedOption.label;
    return customer?.customerSourceDetail
      ? `${selectedOption.label}\n${customer.customerSourceDetail}`
      : selectedOption.label;
  }, [customer?.customerSourceDetail, selectedOption]);

  const saveSource = async (source, detail = "") => {
    if (isSaving) return;

    setIsSaving(true);
    setError("");

    try {
      await onChange(customer, source, detail.trim());
      setIsOpen(false);
    } catch (saveError) {
      const message =
        saveError?.message || "บันทึกช่องทางที่ลูกค้ารู้จักเราไม่สำเร็จ";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-y-0 left-0 z-20">
      <button
        type="button"
        title={tooltip}
        aria-label={`ช่องทางที่ลูกค้ารู้จักเรา: ${tooltip}`}
        onClick={(event) => {
          event.stopPropagation();
          setOtherDetail(
            customer?.customerSource === "other"
              ? customer?.customerSourceDetail || ""
              : ""
          );
          setPendingSource(customer?.customerSource || "");
          setError("");
          setIsOpen((current) => !current);
        }}
        className="h-full w-[6px] cursor-pointer rounded-l-2xl transition-[width,filter] hover:w-[10px] hover:brightness-95 focus:w-[10px] focus:outline-none focus:ring-2 focus:ring-black/20"
        style={{ backgroundColor: selectedOption?.color || DEFAULT_SOURCE_COLOR }}
      />

      {isOpen && (
        <div
          className="absolute left-3 top-2 z-50 w-[min(330px,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-3 text-left text-sm text-zinc-900 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="px-1 pb-2 text-sm font-bold">
            ลูกค้ารู้จักเราจากช่องทางไหน?
          </p>

          <div className="max-h-[270px] space-y-1 overflow-y-auto pr-1">
            {CUSTOMER_SOURCE_OPTIONS.map((option) => {
              const isSelected =
                customer?.customerSource === option.value ||
                pendingSource === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    if (option.value === "other") {
                      setPendingSource("other");
                      setOtherDetail(customer?.customerSourceDetail || "");
                      return;
                    }
                    setPendingSource(option.value);
                    saveSource(option.value, "");
                  }}
                  className={`flex min-h-10 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSelected
                      ? "text-white"
                      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                  }`}
                  style={isSelected ? brandChrome.activeControl : undefined}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: option.color }}
                  />
                  <span className="min-w-0 flex-1">{option.label}</span>
                </button>
              );
            })}
          </div>

          {pendingSource === "other" && (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <label className="mb-2 block text-xs font-bold text-zinc-600">
                ระบุช่องทางเพิ่มเติม
              </label>
              <input
                value={otherDetail}
                onChange={(event) => setOtherDetail(event.target.value)}
                placeholder="เช่น Wedding Fair"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
              <button
                type="button"
                disabled={isSaving}
                onClick={() => saveSource("other", otherDetail)}
                className="mt-2 min-h-10 w-full rounded-xl px-3 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                style={brandChrome.primaryButton}
              >
                {isSaving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          )}

          {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUBMIT_COOLDOWN_MS = 30 * 1000;
const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_FILE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

const BRAND_CONFIG = {
  pharadol: {
    name: "Pharadol Production",
    logo: "/customer-form/pharadol-logo-gold-transparent-v2.png",
    primary: "#0F3D31",
    deep: "#082E25",
    accent: "#CDAE77",
    soft: "#F6EFD7",
    background: "#F6F7F3",
    paymentQr: "/pharadol-payment-qr.png",
    paymentQrFileName: "pharadol-payment-qr.png",
    paymentName: "PHARADOL PRODUCTION",
    paymentHeaderBackground:
      "radial-gradient(circle at 88% 18%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 32%), linear-gradient(135deg, #294B41 0%, #102D25 100%)",
    paymentPillBackground: "#C8A86B",
    paymentPillText: "#102D25",
    logoDark: true,
  },
  adisorn: {
    name: "Adisorn Wedding Studio",
    logo: "/adisorn-logo.png",
    primary: "#4A2E22",
    deep: "#2B1A14",
    accent: "#C9A46A",
    soft: "#F3E6CF",
    background: "#FAF7F1",
    paymentQr: "/adisorn-payment-qr.png",
    paymentQrFileName: "adisorn-payment-qr.png",
    paymentName: "ADISORN WEDDING STUDIO",
    paymentHeaderBackground:
      "radial-gradient(circle at 88% 10%, rgba(201,164,106,0.24), transparent 30%), linear-gradient(135deg, #2B1A14 0%, #4A2E22 45%, #5A3828 72%, #24120D 100%)",
    logoDark: false,
  },
};

const initialForm = {
  customerName: "",
  phone: "",
  email: "",
  eventLocation: "",
  eventDate: "",
  note: "",
};

export default function CustomerRequestFormPage({ brand }) {
  const config = BRAND_CONFIG[brand] || BRAND_CONFIG.pharadol;
  const slipInputId = `${brand}-customer-payment-slip`;
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(1);
  const [fieldErrors, setFieldErrors] = useState({});
  const [qrImageAvailable, setQrImageAvailable] = useState(true);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [qrActionMessage, setQrActionMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  };

  const validateStepOne = () => {
    const nextErrors = {};

    if (!form.customerName.trim()) {
      nextErrors.customerName = "กรุณากรอกชื่อ";
    }

    if (!form.phone.trim()) {
      nextErrors.phone = "กรุณากรอกเบอร์โทร";
    }

    if (!form.eventLocation.trim()) {
      nextErrors.eventLocation = "กรุณากรอกสถานที่จัดงาน";
    }

    if (!form.eventDate) {
      nextErrors.eventDate = "กรุณาเลือกวันงาน";
    }

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "กรุณากรอกอีเมลให้ถูกต้อง";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNextStep = () => {
    setSubmitError("");
    if (!validateStepOne()) return;
    setStep(2);
  };

  const validateFile = (nextFile) => {
    if (!nextFile) return "";
    const extension = String(nextFile.name || "")
      .split(".")
      .pop()
      ?.toLowerCase();

    if (!ALLOWED_FILE_TYPES.has(nextFile.type) || !ALLOWED_FILE_EXTENSIONS.has(extension)) {
      return "รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF เท่านั้น";
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      return "ไฟล์สลิปมีขนาดใหญ่เกิน 10MB";
    }

    return "";
  };

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    const nextError = validateFile(nextFile);

    setFileError(nextError);
    setFile(nextError ? null : nextFile);

    if (nextError) {
      event.target.value = "";
    }
  };

  const uploadSlip = async () => {
    if (!file) return { slipUrl: "", slipFileName: "", slipFileType: "" };

    const formData = new FormData();
    formData.append("brandId", brand);
    formData.append("expectedBrandId", brand);
    formData.append("file", file, file.name);

    const response = await fetch("/api/google/upload", {
      method: "POST",
      body: formData,
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(result.error || "แนบสลิปไม่สำเร็จ");
    }

    return {
      slipUrl:
        file.type === "application/pdf"
          ? result.driveViewUrl || result.driveDownloadUrl || ""
          : result.driveDownloadUrl || result.driveViewUrl || "",
      slipFileName: file.name,
      slipFileType: file.type,
    };
  };

  const submitRequest = async (slipData) => {
    const response = await fetch("/api/customer-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand,
        ...form,
        ...slipData,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(result.error || "ส่งข้อมูลไม่สำเร็จ");
    }

    return result.request;
  };

  const renderLogo = (priority = false) =>
  config.logoDark ? (
    <div className="flex w-full items-center justify-center">
      <Image
        src="/customer-form/pharadol-logo-transparent.png"
        alt={config.name}
        width={684}
        height={200}
        priority={priority}
        className="mx-auto block h-auto w-[280px] translate-x-3 bg-transparent object-contain sm:w-[360px] sm:translate-x-4"
      />
    </div>
  ) : (
    <div className="relative h-24 w-24 overflow-hidden rounded-full border border-zinc-200 bg-white shadow-sm">
      <Image
        src={config.logo}
        alt={config.name}
        fill
        sizes="96px"
        priority={priority}
        className="object-contain"
      />
    </div>
  );

const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSuccessMessage("");

    if (isSubmitting) return;

    if (step !== 2) return;
    if (!validateStepOne()) {
      setStep(1);
      return;
    }

    if (fileError) return;

    const cooldownKey = `${brand}_customer_request_last_submit`;
    const lastSubmittedAt = Number(localStorage.getItem(cooldownKey) || 0);
    const cooldownRemaining = SUBMIT_COOLDOWN_MS - (Date.now() - lastSubmittedAt);

    if (cooldownRemaining > 0) {
      setSubmitError("ส่งข้อมูลเร็วเกินไป กรุณารอสักครู่แล้วลองใหม่");
      return;
    }

    setIsSubmitting(true);

    try {
      let slipData = { slipUrl: "", slipFileName: "", slipFileType: "" };
      let slipUploadFailed = false;

      try {
        slipData = await uploadSlip();
      } catch (slipError) {
        slipUploadFailed = Boolean(file);
        console.error("Cannot upload customer slip", slipError);
      }

      await submitRequest(slipData);
      localStorage.setItem(cooldownKey, String(Date.now()));
      setForm(initialForm);
      setFieldErrors({});
      setFile(null);
      setStep(1);
      setSuccessMessage(
        slipUploadFailed
          ? "ส่งข้อมูลสำเร็จ แต่แนบสลิปไม่สำเร็จ กรุณาติดต่อทีมงาน"
          : "ส่งข้อมูลเรียบร้อยแล้ว"
      );
    } catch (error) {
      setSubmitError(error.message || "ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (field) =>
    `min-h-[54px] rounded-2xl border px-4 text-base outline-none transition focus:border-[var(--form-primary)] ${
      fieldErrors[field]
        ? "border-red-300 bg-red-50/40"
        : "border-zinc-200 bg-white"
    }`;

  const textareaClass = (field) =>
    `resize-none rounded-2xl border px-4 py-3 text-base leading-7 outline-none transition focus:border-[var(--form-primary)] ${
      fieldErrors[field]
        ? "border-red-300 bg-red-50/40"
        : "border-zinc-200 bg-white"
    }`;

  const FieldError = ({ field }) =>
    fieldErrors[field] ? (
      <span className="text-xs font-semibold text-red-600">
        {fieldErrors[field]}
      </span>
    ) : null;

  const isStepOneReady = () =>
    Boolean(
      form.customerName.trim() &&
        form.phone.trim() &&
        form.eventLocation.trim() &&
        form.eventDate &&
        (!form.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    );

  const depositAmount = Number(form.depositAmount || form.amount || 0);
  const depositLabel =
    depositAmount > 0
      ? `ยอดมัดจำ: ฿${depositAmount.toLocaleString()}`
      : "ยอดชำระตามที่ทีมงานแจ้ง";
  const paymentInstruction =
    "กรุณาชำระเงินเพื่อยืนยันการจอง และแนบสลิปหลังโอนสำเร็จ";
  const getQrUrl = () =>
    typeof window === "undefined"
      ? config.paymentQr
      : new URL(config.paymentQr, window.location.origin).toString();

  const showQrActionMessage = (message) => {
    setQrActionMessage(message);
    window.setTimeout(() => setQrActionMessage(""), 1800);
  };

  const sharePaymentQr = async () => {
    const qrUrl = getQrUrl();

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${config.paymentName} QR Payment`,
          text: "สแกน QR Code เพื่อโอนจอง แล้วแนบสลิปหลังโอนสำเร็จ",
          url: qrUrl,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(qrUrl);
        showQrActionMessage("คัดลอกลิงก์ QR แล้ว");
        return;
      }

      showQrActionMessage("ไม่สามารถแชร์ QR บนอุปกรณ์นี้ได้");
    } catch (error) {
      if (error?.name === "AbortError") return;

      try {
        await navigator.clipboard?.writeText(qrUrl);
        showQrActionMessage("คัดลอกลิงก์ QR แล้ว");
      } catch {
        showQrActionMessage("ไม่สามารถแชร์ QR บนอุปกรณ์นี้ได้");
      }
    }
  };

  const downloadPaymentQr = () => {
    const link = document.createElement("a");
    link.href = config.paymentQr;
    link.download = config.paymentQrFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const StepIndicator = () => (
    <div className="mb-5 grid grid-cols-2 gap-2 rounded-[20px] border border-zinc-200 bg-zinc-50 p-2">
      {[
        ["1", "ข้อมูลการจอง"],
        ["2", "แนบสลิป"],
      ].map(([number, label]) => {
        const active = Number(number) === step;

        return (
          <div
            key={number}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-3 text-sm font-black transition"
            style={{
              backgroundColor: active ? config.primary : "#FFFFFF",
              color: active ? "#FFFFFF" : "#A1A1AA",
              boxShadow: active ? "0 10px 24px rgba(15, 23, 42, 0.12)" : "none",
            }}
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
              style={{
                backgroundColor: active ? config.accent : "#F4F4F5",
                color: active ? config.primary : "#A1A1AA",
              }}
            >
              {number}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );

  const PaymentQrCard = () => (
    <div className="mx-auto w-full max-w-[760px] overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:rounded-[32px]">
      <div
        className="grid h-auto min-h-[106px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-[18px] py-[14px] sm:min-h-[110px] sm:gap-4 sm:px-[28px] sm:py-[16px]"
        style={{
              background:
                config.paymentName === "PHARADOL PRODUCTION"
                  ? "linear-gradient(180deg, #1e3324 0%, #16211b 100%)"
                  : config.paymentHeaderBackground,
            }}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
              <p
                className="mb-1.5 text-[10px] font-bold uppercase leading-none tracking-[4px] sm:mb-2 sm:text-[11px] sm:tracking-[5px]"
                style={{
                  color:
                    config.paymentName === "PHARADOL PRODUCTION"
                      ? "#9f8e66"
                      : "#e9d4a1",
                }}
              >
                QR PAYMENT
              </p>

              <p
                className="m-0 whitespace-nowrap text-[clamp(16px,4.8vw,19px)] font-extrabold leading-none tracking-[-0.3px] sm:text-[23px]"
                style={{
                  color:
                    config.paymentName === "PHARADOL PRODUCTION"
                      ? "#f5f3ee"
                      : "#ffffff",
                }}
              >
                {config.paymentName}
              </p>
            </div>

            <label
              data-payment-slip-trigger="true"
              className="inline-flex h-[36px] w-[110px] shrink-0 items-center justify-center justify-self-end whitespace-nowrap rounded-full px-3 text-[13px] font-extrabold leading-none sm:h-[40px] sm:w-[136px] sm:px-4 sm:text-[15px] cursor-pointer select-none transition active:scale-[0.97]"
              style={{
                backgroundColor:
                  config.paymentName === "PHARADOL PRODUCTION"
                    ? "#9f8e66"
                    : config.paymentPillBackground || config.accent,
                color:
                  config.paymentName === "PHARADOL PRODUCTION"
                    ? "#16211b"
                    : config.paymentPillText || config.primary,
              }}
              title="แนบสลิปการโอน"
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                className="sr-only"
              />

              <span>
                {file && !fileError ? "แนบแล้ว ✓" : "แนบสลิป"}
              </span>
            </label>
      </div>

      <div className="px-3 py-3 text-center sm:px-7 sm:py-8">
        <div className="mx-auto mb-2 inline-flex rounded-full px-4 py-1.5 text-[13px] font-black sm:mb-5 sm:px-4 sm:py-2 sm:text-sm" style={{ backgroundColor: config.soft, color: config.primary }}>
          {depositLabel}
        </div>

        <div className="mx-auto flex w-full max-w-[225px] items-center justify-center rounded-[18px] bg-white p-0 sm:max-w-[520px] sm:rounded-[26px] sm:p-2">
          {qrImageAvailable ? (
            <img
              src={config.paymentQr}
              alt={`QR Code สำหรับโอนจอง ${config.name}`}
              className="block h-auto w-full max-w-[225px] object-contain sm:max-w-[500px]"
              onError={() => setQrImageAvailable(false)}
            />
          ) : (
            <div className="flex h-[300px] w-full max-w-[360px] flex-col items-center justify-center rounded-[26px] border border-dashed border-zinc-300 bg-zinc-50 px-5 text-center sm:h-[440px] sm:max-w-[540px]">
              <span className="text-5xl font-black" style={{ color: config.primary }}>
                QR
              </span>
              <span className="mt-4 text-sm font-bold text-zinc-500">
                เพิ่มรูป QR Code ใน public
              </span>
              <span className="mt-2 text-xs font-semibold text-zinc-400">
                {config.paymentQr}
              </span>
            </div>
          )}
        </div>

        <p className="mt-2 text-base font-black sm:mt-5 sm:text-lg" style={{ color: config.primary }}>
          สแกนเพื่อโอนจอง
        </p>
        <p className="mt-0.5 hidden text-xs font-semibold leading-5 text-zinc-500 sm:block sm:text-sm sm:leading-6">
          หลังโอนแล้ว กรุณาแนบสลิปด้านล่าง
        </p>

        <div className="mx-auto mt-2 grid min-h-[42px] w-full max-w-[360px] grid-cols-2 overflow-hidden rounded-[14px] border border-zinc-200 bg-white shadow-sm sm:mt-5 sm:min-h-[56px] sm:max-w-[620px] sm:rounded-[18px]">
          <button
            type="button"
            onClick={sharePaymentQr}
            className="min-h-[42px] px-2 text-[13px] font-black transition hover:bg-zinc-50 sm:min-h-[52px] sm:px-3 sm:text-base"
            style={{ color: config.primary }}
          >
            แชร์ QR
          </button>
          <button
            type="button"
            onClick={downloadPaymentQr}
            className="min-h-[42px] border-l border-zinc-200 px-2 text-[13px] font-black transition hover:bg-zinc-50 sm:min-h-[52px] sm:px-3 sm:text-base"
            style={{ color: config.primary }}
          >
            บันทึก QR
          </button>
        </div>

          <label
            data-mobile-slip-cta="true"
            className="hidden sm:block mx-auto mt-3 flex min-h-[52px] w-full max-w-[360px] cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 text-base font-black text-white shadow-sm transition active:scale-[0.99] sm:hidden"
            style={{ backgroundColor: config.primary }}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              className="sr-only"
            />

            <span className="text-xl leading-none">↑</span>
            <span>
              {file && !fileError ? "เปลี่ยนสลิปการโอน" : "แนบสลิปการโอน"}
            </span>
          </label>

          {file && !fileError && (
            <div className="mx-auto mt-2 max-w-[360px] rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left sm:hidden">
              <p className="text-xs font-black text-emerald-700">
                แนบสลิปแล้ว
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-emerald-700/80">
                {file.name}
              </p>
            </div>
          )}

          {fileError && (
            <p className="mx-auto mt-2 max-w-[360px] rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 sm:hidden">
              {fileError}
            </p>
          )}
        {qrActionMessage && (
          <p className="mt-3 text-xs font-bold" style={{ color: config.primary }}>
            {qrActionMessage}
          </p>
        )}
      </div>
    </div>
  );

  if (successMessage) {
    return (
      <main
        className="min-h-screen px-4 py-6 text-zinc-950 sm:px-6 sm:py-10"
        style={{
          background: `radial-gradient(circle at top, ${config.soft} 0%, ${config.background} 46%, ${config.background} 100%)`,
        }}
      >
        <section className="mx-auto flex min-h-[calc(100dvh-48px)] max-w-xl items-center justify-center sm:min-h-[calc(100vh-80px)]">
          <div className="w-full overflow-hidden rounded-[30px] border border-white/80 bg-white/90 px-6 py-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur sm:px-10 sm:py-10">
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                backgroundColor: config.soft,
                color: config.primary,
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-8 w-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>

            <div className="mx-auto mt-5 flex justify-center [&_img]:max-h-[82px] [&_img]:w-auto">
              {renderLogo()}
            </div>

            <p className="mt-5 text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400">
              ส่งข้อมูลสำเร็จ
            </p>

            <h1 className="mt-3 text-[30px] font-black leading-tight tracking-[-0.03em] text-zinc-950 sm:text-4xl">
              ส่งข้อมูลเรียบร้อยแล้ว
            </h1>

            <p className="mx-auto mt-4 max-w-md text-[15px] font-medium leading-7 text-zinc-600 sm:text-base">
              ขอบคุณสำหรับข้อมูลและสลิปการโอน ทีมงานได้รับข้อมูลแล้ว
              และจะติดต่อกลับโดยเร็วที่สุด
            </p>

            <div className="mx-auto mt-6 max-w-md rounded-2xl border border-zinc-100 bg-zinc-50/90 px-4 py-4 text-left">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-black"
                  style={{
                    backgroundColor: config.soft,
                    color: config.primary,
                  }}
                >
                  ✓
                </span>

                <div>
                  <p className="text-sm font-black text-zinc-800">
                    ระบบบันทึกข้อมูลแล้ว
                  </p>
                  <p className="mt-0.5 text-xs font-semibold leading-5 text-zinc-500">
                    ไม่ต้องกรอกหรือส่งข้อมูลซ้ำอีกครั้ง
                  </p>
                </div>
              </div>
            </div>

            {successMessage !== "ส่งข้อมูลเรียบร้อยแล้ว" && (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
                {successMessage}
              </p>
            )}

            <p className="mt-6 text-xs font-semibold text-zinc-400">
              สามารถปิดหน้านี้ได้เลย
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen px-3 pb-8 pt-3 text-zinc-950 sm:px-4 sm:py-8"
      style={{
        backgroundColor: config.background,
        "--form-primary": config.primary,
      }}
    >
      <section className={step === 2 ? "mx-auto max-w-[760px]" : "mx-auto max-w-2xl"}>
        <div className="mb-6 flex flex-col items-center text-center">
          {renderLogo(true)}
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-zinc-400">
            {config.name}
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
            {step === 1
              ? "กรอกข้อมูลเบื้องต้นสำหรับการจองงาน"
              : "ชำระเงินมัดจำ"}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-600 sm:text-base">
            {step === 1
              ? "กรอกข้อมูลสั้น ๆ เพื่อให้ทีมงานติดต่อกลับและเตรียมรายละเอียดให้เหมาะกับงานของคุณ"
              : "สแกน QR Code เพื่อโอนจอง แล้วแนบสลิปด้านล่าง"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className={
            step === 2
              ? "rounded-[26px] border-0 bg-transparent p-0 shadow-none"
              : "rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-7"
          }
        >
          <StepIndicator />

          {step === 1 ? (
            <>
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  ชื่อ *
                  <input
                    value={form.customerName}
                    onChange={(event) => updateField("customerName", event.target.value)}
                    className={inputClass("customerName")}
                  />
                  <FieldError field="customerName" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  เบอร์โทร *
                  <input
                    value={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                    className={inputClass("phone")}
                  />
                  <FieldError field="phone" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  อีเมล
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    className={inputClass("email")}
                  />
                  <FieldError field="email" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  สถานที่จัดงาน *
                  <input
                    value={form.eventLocation}
                    onChange={(event) => updateField("eventLocation", event.target.value)}
                    className={inputClass("eventLocation")}
                  />
                  <FieldError field="eventLocation" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  วันงาน *
                  <input
                    type="date"
                    value={form.eventDate}
                    onChange={(event) => updateField("eventDate", event.target.value)}
                    className={inputClass("eventDate")}
                  />
                  <FieldError field="eventDate" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  รายละเอียดเพิ่มเติม
                  <textarea
                    value={form.note}
                    onChange={(event) => updateField("note", event.target.value)}
                    rows={4}
                    placeholder="เช่น ประเภทงาน เวลาโดยประมาณ จำนวนแขก หรือสิ่งที่อยากแจ้งทีมงาน"
                    className={textareaClass("note")}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={goNextStep}
                className="mt-6 min-h-[56px] w-full rounded-2xl px-5 text-base font-bold text-white transition hover:-translate-y-0.5"
                style={{ backgroundColor: config.primary }}
              >
                ถัดไป
              </button>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:gap-4">
                <PaymentQrCard />

                <label
                  htmlFor={slipInputId}
                  className="group block cursor-pointer rounded-[24px] border border-dashed border-zinc-300 bg-[#F8FAFC] p-5 text-center transition hover:bg-white sm:rounded-[26px] sm:p-7"
                  onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor = config.accent;
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = file && !fileError ? config.accent : "#D4D4D8";
                  }}
                  style={{
                    borderColor: file && !fileError ? config.accent : undefined,
                  }}
                >
                  <input
                    id={slipInputId}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                  <span
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-2xl font-black transition group-hover:scale-105"
                    style={{ backgroundColor: config.soft, color: config.primary }}
                  >
                    ↑
                  </span>
                  <span className="mt-2 block text-base font-black text-zinc-800 sm:mt-3">
                    {file && !fileError ? "แนบสลิปแล้ว" : "แนบสลิปการโอน"}
                  </span>
                  <span className="mt-1 block text-sm font-semibold leading-6 text-zinc-500">
                    รองรับ JPG, PNG, WEBP, PDF ขนาดไม่เกิน 10MB
                  </span>
                  {file && !fileError && (
                    <div className="mx-auto mt-3 max-w-xl rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:mt-4">
                      <p className="text-sm font-black text-emerald-700">
                        แนบสลิปแล้ว
                      </p>
                      <p className="mt-1 break-all text-xs font-semibold text-emerald-700/80">
                        {file.name}
                      </p>
                      <span className="mt-3 inline-flex min-h-8 items-center rounded-full bg-white px-3 text-xs font-black text-emerald-700">
                        เปลี่ยนไฟล์
                      </span>
                    </div>
                  )}
                </label>
                {fileError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{fileError}</p>}
                {submitError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{submitError}</p>}
              </div>

              <div className="mt-3 grid grid-cols-[0.72fr_1.28fr] gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitError("");
                    setStep(1);
                  }}
                  disabled={isSubmitting}
                  className="min-h-[48px] rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[56px] sm:px-5 sm:text-base"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || Boolean(fileError) || !isStepOneReady()}
                  className="min-h-[48px] rounded-2xl px-3 text-sm font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[56px] sm:px-5 sm:text-base"
                  style={{ backgroundColor: config.primary }}
                >
                  {isSubmitting ? "กำลังส่งข้อมูล..." : "ส่งข้อมูล"}
                </button>
              </div>
            </>
          )}
        </form>
      </section>
    </main>
  );
}

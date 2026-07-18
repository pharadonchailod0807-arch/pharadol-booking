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
    accent: "#143321",
    logoDark: true,
  },
  adisorn: {
    name: "Adisorn Wedding Studio",
    logo: "/adisorn-logo.png",
    accent: "#5b3117",
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
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
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
      setFile(null);
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

  if (successMessage) {
    return (
      <main className="min-h-screen bg-[#f8f7f4] px-4 py-8 text-zinc-950">
        <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-2xl flex-col items-center justify-center text-center">
          {renderLogo()}
          <h1 className="mt-8 text-3xl font-bold leading-tight sm:text-4xl">
            ส่งข้อมูลเรียบร้อยแล้ว
          </h1>
          <p className="mt-4 max-w-xl text-base leading-8 text-zinc-600">
            ขอบคุณสำหรับข้อมูล ทีมงานจะติดต่อกลับโดยเร็วที่สุด
          </p>
          {successMessage !== "ส่งข้อมูลเรียบร้อยแล้ว" && (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {successMessage}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f7f4] px-4 py-6 text-zinc-950 sm:py-10">
      <section className="mx-auto max-w-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          {renderLogo(true)}
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.26em] text-zinc-400">
            {config.name}
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            กรอกข้อมูลเบื้องต้นสำหรับการจองงาน
          </h1>
          <p className="mt-4 max-w-xl text-base leading-8 text-zinc-600">
            กรอกข้อมูลสั้น ๆ เพื่อให้ทีมงานติดต่อกลับและเตรียมรายละเอียดให้เหมาะกับงานของคุณ
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              ชื่อ *
              <input required value={form.customerName} onChange={(event) => updateField("customerName", event.target.value)} className="rounded-2xl border border-zinc-200 px-4 py-3 text-base outline-none transition focus:border-zinc-900" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              เบอร์โทร *
              <input required value={form.phone} onChange={(event) => updateField("phone", event.target.value)} className="rounded-2xl border border-zinc-200 px-4 py-3 text-base outline-none transition focus:border-zinc-900" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              อีเมล
              <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} className="rounded-2xl border border-zinc-200 px-4 py-3 text-base outline-none transition focus:border-zinc-900" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              สถานที่จัดงาน *
              <input required value={form.eventLocation} onChange={(event) => updateField("eventLocation", event.target.value)} className="rounded-2xl border border-zinc-200 px-4 py-3 text-base outline-none transition focus:border-zinc-900" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              วันงาน *
              <input required type="date" value={form.eventDate} onChange={(event) => updateField("eventDate", event.target.value)} className="rounded-2xl border border-zinc-200 px-4 py-3 text-base outline-none transition focus:border-zinc-900" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              รายละเอียดเพิ่มเติม
              <textarea value={form.note} onChange={(event) => updateField("note", event.target.value)} rows={5} placeholder="เช่น ประเภทงาน เวลาโดยประมาณ จำนวนแขก หรือสิ่งที่อยากแจ้งทีมงาน" className="resize-none rounded-2xl border border-zinc-200 px-4 py-3 text-base leading-7 outline-none transition focus:border-zinc-900" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              แนบสลิปการโอนจอง
              <span className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center text-sm font-medium text-zinc-500">
                รองรับ JPG, PNG, WEBP, PDF ขนาดไม่เกิน 10MB
                <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileChange} className="mt-3 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
              </span>
            </label>
            {fileError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{fileError}</p>}
            {submitError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{submitError}</p>}
          </div>

          <button type="submit" disabled={isSubmitting || Boolean(fileError)} className="mt-6 w-full rounded-2xl px-5 py-4 text-base font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60" style={{ backgroundColor: config.accent }}>
            {isSubmitting ? "กำลังส่งข้อมูล..." : "ส่งข้อมูล"}
          </button>
        </form>
      </section>
    </main>
  );
}

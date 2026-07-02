"use client";

import { useState } from "react";

export default function GoogleUploadPage() {
  const [file, setFile] = useState(null);
  const [brand, setBrand] = useState("pharadol");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  const getReadableErrorMessage = (value, fallback) => {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    if (typeof value?.message === "string") return value.message;
    if (typeof value?.error === "string") return value.error;

    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  };

  async function handleUpload(event) {
    event.preventDefault();

    if (!file) {
      setStatus("กรุณาเลือกไฟล์ PDF");
      return;
    }

    setUploading(true);
    setStatus("กำลังอัปโหลด...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("brandId", brand);
      formData.append("expectedBrandId", brand);

      const response = await fetch("/api/google/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getReadableErrorMessage(data.error || data, "อัปโหลดไม่สำเร็จ")
        );
      }

      setStatus("อัปโหลด PDF ไป Google Drive สำเร็จ");
    } catch (error) {
      setStatus(getReadableErrorMessage(error, "อัปโหลดไม่สำเร็จ"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <main style={{ padding: "40px", maxWidth: "600px", margin: "auto" }}>
      <h1>อัปโหลด PDF ไป Google Drive</h1>

      <form onSubmit={handleUpload}>
        <label>
          แบรนด์
          <select
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            style={{ display: "block", marginTop: 8, marginBottom: 16 }}
          >
            <option value="pharadol">Pharadol</option>
            <option value="adisorn">Adisorn</option>
          </select>
        </label>

        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />

        <br />
        <br />

        <button type="submit" disabled={uploading}>
          {uploading ? "กำลังอัปโหลด..." : "อัปโหลด PDF"}
        </button>
      </form>

      {status && <p>{status}</p>}
    </main>
  );
}

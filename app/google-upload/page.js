"use client";

import { useState } from "react";

export default function GoogleUploadPage() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

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

      const response = await fetch("/api/google/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "อัปโหลดไม่สำเร็จ");
      }

      setStatus("อัปโหลด PDF ไป Google Drive สำเร็จ");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <main style={{ padding: "40px", maxWidth: "600px", margin: "auto" }}>
      <h1>อัปโหลด PDF ไป Google Drive</h1>

      <form onSubmit={handleUpload}>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const EVENT_TYPES = [
  ["Wedding", "wedding"],
  ["Pre Wedding", "pre wedding"],
  ["Event", "event"],
  ["Concert", "concert"],
  ["งานบวช", "งานบวช"],
  ["งานศพ", "งานศพ"],
  ["งานสัมมนา", "งานสัมมนา"],
  ["อื่นๆ", "อื่นๆ"],
];

const DELIVERY_TYPES = {
  still: ["demo", "final"],
  video: ["all footage", "teaser", "highlight", "final"],
};

const EMPTY_FORM = {
  customerName: "",
  detail: "",
  workDate: "",
  eventType: "wedding",
  otherEventType: "",
  mediaType: "still",
  deliveryType: "demo",
};

const THEMES = {
  pharadol: {
    label: "PHARADOL FILM & STILL",
    primary: "#173d31",
    accent: "#cfa257",
    soft: "#eef5f1",
    background: "#f4f6f2",
  },
  adisorn: {
    label: "ADISORN WEDDING STUDIO",
    primary: "#76543b",
    accent: "#b88763",
    soft: "#f7efe9",
    background: "#f7f3ef",
  },
};

const cleanPart = (value) =>
  String(value || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatBytes = (bytes) => {
  const safeBytes = Math.max(0, Number(bytes || 0));

  if (safeBytes < 1024) return `${safeBytes.toFixed(0)} B`;
  if (safeBytes < 1024 * 1024) return `${(safeBytes / 1024).toFixed(0)} KB`;
  if (safeBytes < 1024 * 1024 * 1024) {
    return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(safeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDuration = (seconds) => {
  const safeSeconds = Math.max(0, Math.round(Number(seconds || 0)));

  if (safeSeconds < 60) return `${safeSeconds} วินาที`;

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes} นาที ${remainingSeconds} วินาที`;
};

const uploadToSession = async ({ file, uploadUrl, onProgress }) =>
  new Promise((resolve, reject) => {
    void (async () => {

  const fileToUpload = file;

  if (
    !fileToUpload ||
    typeof fileToUpload.size !== "number" ||
    fileToUpload.size <= 0
  ) {
    throw new Error("ไฟล์ที่เลือกไม่ถูกต้องหรือไฟล์มีขนาด 0 ไบต์");
  }

  const reportProgress =
    typeof onProgress === "function" ? onProgress : () => {};

  let resumableUrl = String(uploadUrl || "").trim();

  if (!resumableUrl) {
    throw new Error("ไม่พบ Google Drive upload session URL");
  }


  const totalBytes = fileToUpload.size;
  const mimeType =
    fileToUpload.type || "application/octet-stream";

  // Google Drive กำหนดให้ chunk เป็นจำนวนเท่าของ 256 KiB
  const chunkSize = 8 * 1024 * 1024;
  const maxRetries = 4;

  const wait = (milliseconds) =>
    new Promise((resolve) =>
      window.setTimeout(resolve, milliseconds)
    );

  const safeJsonParse = (value) => {
    if (!value) return {};

    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  };

  const sendChunk = (chunk, startByte, endByte) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open("PUT", resumableUrl, true);
      xhr.setRequestHeader("Content-Type", mimeType);
      xhr.setRequestHeader(
        "Content-Range",
        `bytes ${startByte}-${endByte}/${totalBytes}`
      );

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;

        const uploadedBytes = Math.min(
          totalBytes,
          startByte + event.loaded
        );

        const percent = Math.min(
          100,
          Math.round((uploadedBytes / totalBytes) * 100)
        );

        reportProgress(percent, uploadedBytes, totalBytes);
      };

      xhr.onerror = () => {
        reject(
          new Error(
            "เชื่อมต่อ Google Drive ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต"
          )
        );
      };

      xhr.onabort = () => {
        reject(new Error("การอัปโหลดถูกยกเลิก"));
      };

      xhr.onload = () => {
        const status = xhr.status;
        const responseBody = safeJsonParse(xhr.responseText);
        const acceptedRange =
          xhr.getResponseHeader("Range") || "";

        if (
          status === 308 ||
          (status >= 200 && status < 300)
        ) {
          resolve({
            status,
            responseBody,
            acceptedRange,
          });
          return;
        }

        reject(
          new Error(
            responseBody?.error?.message ||
              responseBody?.error ||
              `Google Drive ตอบกลับ HTTP ${status}`
          )
        );
      };

      xhr.send(chunk);
    });

  const queryUploadStatus = () =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open("PUT", resumableUrl, true);
      xhr.setRequestHeader(
        "Content-Range",
        `bytes */${totalBytes}`
      );

      xhr.onerror = () =>
        reject(new Error("ตรวจสอบสถานะการอัปโหลดไม่สำเร็จ"));

      xhr.onload = () => {
        const responseBody = safeJsonParse(xhr.responseText);

        if (
          xhr.status === 308 ||
          (xhr.status >= 200 && xhr.status < 300)
        ) {
          resolve({
            status: xhr.status,
            responseBody,
            acceptedRange:
              xhr.getResponseHeader("Range") || "",
          });
          return;
        }

        reject(
          new Error(
            responseBody?.error?.message ||
              `ตรวจสอบสถานะไม่สำเร็จ HTTP ${xhr.status}`
          )
        );
      };

      xhr.send();
    });

  let offset = 0;
  let completedFile = null;

  while (offset < totalBytes) {
    const endExclusive = Math.min(
      offset + chunkSize,
      totalBytes
    );

    const endByte = endExclusive - 1;
    const chunk = fileToUpload.slice(offset, endExclusive);

    let result = null;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        result = await sendChunk(
          chunk,
          offset,
          endByte
        );
        lastError = null;
        break;
      } catch (uploadError) {
        lastError = uploadError;

        if (attempt < maxRetries - 1) {
          await wait(1000 * 2 ** attempt);
        }
      }
    }

    if (!result) {
      throw (
        lastError ||
        new Error("อัปโหลดไฟล์ไป Google Drive ไม่สำเร็จ")
      );
    }

    if (
      result.status >= 200 &&
      result.status < 300
    ) {
      completedFile = result.responseBody;
      offset = totalBytes;
      reportProgress(100, totalBytes, totalBytes);
      break;
    }

    const rangeMatch = String(
      result.acceptedRange || ""
    ).match(/bytes=0-(\d+)/i);

    offset = rangeMatch
      ? Number(rangeMatch[1]) + 1
      : endExclusive;

    reportProgress(
      Math.min(
        100,
        Math.round((offset / totalBytes) * 100)
      ),
      offset,
      totalBytes
    );
  }

  // บางครั้ง Google ตอบ 308 หลังรับ byte สุดท้าย
  if (!completedFile) {
    const statusResult = await queryUploadStatus();

    if (
      statusResult.status >= 200 &&
      statusResult.status < 300
    ) {
      completedFile = statusResult.responseBody;
    } else {
      throw new Error(
        "Google Drive ยังไม่ได้ยืนยันว่าอัปโหลดไฟล์เสร็จสมบูรณ์"
      );
    }
  }

  reportProgress(100, totalBytes, totalBytes);

  return {
    ...completedFile,
    success: true,
    file: completedFile,
  };


    })().catch(reject);
  };);

export default function GoogleUploadPage() {
  const router = useRouter();

  const [brand, setBrand] = useState("pharadol");
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({});
  const [drafts, setDrafts] = useState([]);
  const [working, setWorking] = useState(false);
  const [workingStage, setWorkingStage] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState(null);
  const [uploadStats, setUploadStats] = useState({
    startedAt: 0,
    totalBytes: 0,
    completedBytes: 0,
    currentFileLoaded: 0,
    currentFileIndex: 0,
    completedFiles: 0,
    currentFileName: "",
  });
  const [uploadElapsedSeconds, setUploadElapsedSeconds] = useState(0);

  const theme = THEMES[brand];
  const draftKey = `${brand}_customer_delivery_drafts`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedBrand =
      params.get("brand") === "adisorn" ? "adisorn" : "pharadol";

    setBrand(requestedBrand);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    try {
      const savedDrafts = JSON.parse(localStorage.getItem(draftKey) || "[]");
      setDrafts(Array.isArray(savedDrafts) ? savedDrafts : []);
    } catch {
      setDrafts([]);
    }
  }, [ready, draftKey]);

  useEffect(() => {
    const choices = DELIVERY_TYPES[form.mediaType] || [];

    if (!choices.includes(form.deliveryType)) {
      setForm((current) => ({
        ...current,
        deliveryType: choices[0] || "",
      }));
    }
  }, [form.mediaType, form.deliveryType]);

  useEffect(() => {
    if (!working || !uploadStats.startedAt) {
      setUploadElapsedSeconds(0);
      return undefined;
    }

    const updateElapsed = () => {
      setUploadElapsedSeconds(
        Math.max(0, (Date.now() - uploadStats.startedAt) / 1000)
      );
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 500);
    return () => window.clearInterval(timer);
  }, [working, uploadStats.startedAt]);

  const resolvedEventType =
    form.eventType === "อื่นๆ" ? form.otherEventType.trim() : form.eventType;

  const folderName = useMemo(() => {
    const baseName = [
      cleanPart(form.workDate),
      cleanPart(form.customerName),
      cleanPart(resolvedEventType),
    ]
      .filter(Boolean)
      .join(" ");

    const suffix = cleanPart(form.deliveryType).toLowerCase();

    return baseName && suffix ? `${baseName} (${suffix})` : baseName;
  }, [form.workDate, form.customerName, resolvedEventType, form.deliveryType]);

  const transferredBytes = Math.min(
    uploadStats.totalBytes,
    uploadStats.completedBytes + uploadStats.currentFileLoaded
  );

  const uploadPercent = uploadStats.totalBytes
    ? Math.min(
        100,
        Math.round((transferredBytes / uploadStats.totalBytes) * 100)
      )
    : 0;

  const uploadSpeed =
    uploadElapsedSeconds > 0 ? transferredBytes / uploadElapsedSeconds : 0;

  const remainingSeconds =
    uploadSpeed > 0
      ? Math.max(
          0,
          (uploadStats.totalBytes - transferredBytes) / uploadSpeed
        )
      : 0;

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDelivery(null);
    setMessage("");
    setError("");
  };

  const callDrive = async (payload) => {
    const response = await fetch("/api/google/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, ...payload }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(result.error || "ทำรายการกับ Google Drive ไม่สำเร็จ");
    }

    return result;
  };

  const validate = () => {
    if (!form.customerName.trim()) return "กรุณากรอกชื่อ";
    if (!form.workDate) return "กรุณาเลือกวัน เดือน ปี";
    if (!resolvedEventType) return "กรุณาระบุประเภทงาน";
    if (!form.deliveryType) return "กรุณาเลือกชนิดงานที่จะส่ง";
    if (files.length === 0) return "กรุณาเลือกไฟล์ภาพหรือวิดีโอ";
    return "";
  };

  const saveDraft = () => {
    const draft = {
      id: `draft-${Date.now()}`,
      form,
      folderName,
      fileNames: files.map((file) => file.name),
      savedAt: new Date().toISOString(),
    };

    const nextDrafts = [draft, ...drafts].slice(0, 30);

    localStorage.setItem(draftKey, JSON.stringify(nextDrafts));
    setDrafts(nextDrafts);
    setError("");
    setMessage("บันทึกฉบับร่างแล้ว เมื่อเปิดร่างต้องเลือกไฟล์ใหม่อีกครั้ง");
  };

  const openDraft = (draft) => {
    setForm({ ...EMPTY_FORM, ...(draft?.form || {}) });
    setFiles([]);
    setProgress({});
    setDelivery(null);
    setError("");
    setMessage("เปิดฉบับร่างแล้ว กรุณาเลือกไฟล์อีกครั้ง");
  };

  const deleteDraft = (draftId) => {
    const nextDrafts = drafts.filter((draft) => draft.id !== draftId);

    localStorage.setItem(draftKey, JSON.stringify(nextDrafts));
    setDrafts(nextDrafts);
  };

  const createAndUpload = async () => {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const startedAt = Date.now();
    let completedBytes = 0;

    setUploadElapsedSeconds(0);
    setUploadStats({
      startedAt,
      totalBytes,
      completedBytes: 0,
      currentFileLoaded: 0,
      currentFileIndex: 0,
      completedFiles: 0,
      currentFileName: "กำลังเตรียมโฟลเดอร์...",
    });

    setWorkingStage("preparing");

    const folderResult = await callDrive({
      action: "create-folder",
      folderName,
      description: form.detail.trim(),
    });

    const uploadedFiles = [];

    for (const [fileIndex, file] of files.entries()) {
      setWorkingStage("uploading");
      setProgress((current) => ({ ...current, [file.name]: 0 }));
      setUploadStats((current) => ({
        ...current,
        completedBytes,
        currentFileLoaded: 0,
        currentFileIndex: fileIndex + 1,
        completedFiles: fileIndex,
        currentFileName: file.name,
      }));

      const session = await callDrive({
        action: "create-upload-session",
        uploadOrigin: window.location.origin,
        folderId: folderResult.folder.id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      });

      const uploaded = await uploadToSession({
        file,
        uploadUrl: session.uploadUrl,
        onProgress: ({ loaded, percent }) => {
          setProgress((current) => ({ ...current, [file.name]: percent }));
          setUploadStats((current) => ({
            ...current,
            currentFileLoaded: loaded,
          }));
        },
      });

      completedBytes += file.size;

      setProgress((current) => ({ ...current, [file.name]: 100 }));
      setUploadStats((current) => ({
        ...current,
        completedBytes,
        currentFileLoaded: 0,
        completedFiles: fileIndex + 1,
      }));

      uploadedFiles.push(uploaded);
    }

    return {
      folder: folderResult.folder,
      uploadedFiles,
      shareLink: "",
    };
  };

  const saveWork = async (share) => {
    const validationError = validate();

    if (validationError) {
      setError(validationError);
      setMessage("");
      return;
    }

    setWorking(true);
    setError("");
    setMessage("");

    try {
      let nextDelivery = delivery;

      if (!nextDelivery?.folder?.id) {
        nextDelivery = await createAndUpload();
      }

      if (share) {
        setWorkingStage("sharing");
        setUploadStats((current) => ({
          ...current,
          completedBytes: current.totalBytes,
          currentFileLoaded: 0,
          completedFiles: files.length,
          currentFileIndex: files.length,
          currentFileName: "กำลังสร้างลิงก์ส่งงาน...",
        }));

        const shareResult = await callDrive({
          action: "share-folder",
          folderId: nextDelivery.folder.id,
        });

        nextDelivery = {
          ...nextDelivery,
          folder: shareResult.folder,
          shareLink: shareResult.folder.webViewLink || "",
        };
      }

      setDelivery(nextDelivery);
      setMessage(
        share
          ? "ส่งงานพร้อมแล้ว กดคัดลอกลิงก์เพื่อส่งให้ลูกค้า"
          : "บันทึกไฟล์ลง Google Drive เรียบร้อย"
      );
    } catch (workError) {
      console.error(workError);
      setError(workError?.message || "ทำรายการไม่สำเร็จ");
      setMessage("");
    } finally {
      setWorking(false);
      setWorkingStage("");
    }
  };

  const copyLink = async () => {
    if (!delivery?.shareLink) return;

    try {
      await navigator.clipboard.writeText(delivery.shareLink);
      setMessage("คัดลอกลิงก์ Google Drive แล้ว");
    } catch {
      window.prompt("คัดลอกลิงก์นี้", delivery.shareLink);
    }
  };

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-sm font-bold text-zinc-500">
        กำลังโหลด...
      </main>
    );
  }

  const overlayTitle =
    workingStage === "sharing"
      ? "กำลังสร้างลิงก์ส่งงาน"
      : "กำลังอัปโหลดไฟล์งาน";

  const overlayDescription =
    workingStage === "preparing"
      ? "กำลังสร้างโฟลเดอร์บน Google Drive กรุณาอย่าปิดหน้านี้"
      : workingStage === "sharing"
        ? "ไฟล์อัปโหลดเสร็จแล้ว กำลังเตรียมลิงก์สำหรับลูกค้า"
        : "กำลังส่งไฟล์เข้า Google Drive กรุณาอย่าปิดหน้านี้";

  return (
    <>
      {working && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#253b34]/70 px-4 py-6 backdrop-blur-md">
          <div className="w-full max-w-[540px] rounded-[28px] bg-white px-6 py-6 shadow-[0_26px_75px_rgba(0,0,0,0.32)] sm:px-8 sm:py-7 origin-center scale-[0.84] transition-transform sm:scale-[1.08] lg:scale-[1.15]">
            <div className="mx-auto h-14 w-14 animate-spin rounded-full border-[7px] border-[#e1e9e5] border-t-[#0d5a42]" />

            <div className="mt-5 text-center">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#b78a31]">
                {theme.label}
              </p>

              <h2 className="mt-1.5 text-2xl font-black tracking-[-0.04em] text-[#073e2f] sm:text-3xl">
                {overlayTitle}
              </h2>

              <p className="mt-2 text-sm font-medium text-[#687872] sm:text-base">
                {overlayDescription}
              </p>
            </div>

            <div className="mt-6 h-3 overflow-hidden rounded-full bg-[#e4ece8]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0c5941] to-[#2b8e6e] transition-[width] duration-300"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-2xl font-black text-[#07513c] sm:text-3xl">
                {uploadPercent}%
              </p>

              <p className="text-right text-xs font-bold text-[#687872] sm:text-sm">
                {uploadStats.completedFiles}/{files.length} ไฟล์ •{" "}
                {formatBytes(transferredBytes)} /{" "}
                {formatBytes(uploadStats.totalBytes)}
              </p>
            </div>

            <p className="mt-3 truncate text-center text-xs font-semibold text-[#5d7069] sm:text-sm">
              ไฟล์ {Math.max(1, uploadStats.currentFileIndex)}/
              {Math.max(1, files.length)}:{" "}
              {uploadStats.currentFileName || "กำลังเตรียมไฟล์..."}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2 rounded-[20px] bg-[#f1f6f3] px-4 py-4 text-center sm:px-5">
              <div>
                <p className="text-[11px] font-semibold text-[#718078] sm:text-xs">
                  ใช้เวลาแล้ว
                </p>
                <p className="mt-1 text-sm font-black text-[#073e2f] sm:text-base">
                  {formatDuration(uploadElapsedSeconds)}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-[#718078] sm:text-xs">
                  ความเร็ว
                </p>
                <p className="mt-1 text-sm font-black text-[#073e2f] sm:text-base">
                  {formatBytes(uploadSpeed)}/วินาที
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-[#718078] sm:text-xs">
                  เหลือประมาณ
                </p>
                <p className="mt-1 text-sm font-black text-[#073e2f] sm:text-base">
                  {formatDuration(remainingSeconds)}
                </p>
              </div>
            </div>

            <p className="mt-4 text-center text-[10px] font-medium text-[#92a09a] sm:text-xs">
              เปอร์เซ็นต์คำนวณจากข้อมูลที่ส่งจริงจากเครื่องนี้ไปยัง Google Drive
            </p>
          </div>
        </div>
      )}

      <main
        className="min-h-screen px-4 py-5 text-zinc-950 sm:px-6 sm:py-8"
        style={{ backgroundColor: theme.background }}
      >
        <div className="mx-auto w-full max-w-6xl">
          <header className="rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-400">
                  {theme.label}
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">
                  ส่งงานลูกค้า
                </h1>
                <p className="mt-1 text-sm font-medium text-zinc-500">
                  สร้างโฟลเดอร์ อัปโหลดไฟล์ และแชร์ลิงก์จากหน้านี้
                </p>
              </div>

              <button
                type="button"
                onClick={() => router.push(`/${brand}/dashboard`)}
                className="min-h-11 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-black text-zinc-700 hover:bg-zinc-50"
              >
                กลับหน้าแรก
              </button>
            </div>
          </header>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="text-sm font-black text-zinc-800">ชื่อ</span>
                  <input
                    value={form.customerName}
                    onChange={(event) =>
                      updateForm("customerName", event.target.value)
                    }
                    placeholder="เช่น Bow Bank"
                    className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold outline-none focus:border-zinc-400 focus:bg-white"
                  />
                </label>

                <label className="sm:col-span-2">
                  <span className="text-sm font-black text-zinc-800">
                    รายละเอียด{" "}
                    <span className="font-medium text-zinc-400">
                      (ไม่จำเป็น)
                    </span>
                  </span>
                  <textarea
                    value={form.detail}
                    onChange={(event) =>
                      updateForm("detail", event.target.value)
                    }
                    rows={3}
                    placeholder="รายละเอียดเพิ่มเติม"
                    className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold outline-none focus:border-zinc-400 focus:bg-white"
                  />
                </label>

                <label>
                  <span className="text-sm font-black text-zinc-800">
                    วัน เดือน ปี
                  </span>
                  <input
                    type="date"
                    value={form.workDate}
                    onChange={(event) =>
                      updateForm("workDate", event.target.value)
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold outline-none focus:border-zinc-400 focus:bg-white"
                  />
                </label>

                <label>
                  <span className="text-sm font-black text-zinc-800">
                    ประเภทงาน
                  </span>
                  <select
                    value={form.eventType}
                    onChange={(event) =>
                      updateForm("eventType", event.target.value)
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold outline-none focus:border-zinc-400 focus:bg-white"
                  >
                    {EVENT_TYPES.map(([label, value]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                {form.eventType === "อื่นๆ" && (
                  <label className="sm:col-span-2">
                    <span className="text-sm font-black text-zinc-800">
                      ระบุประเภทงานอื่นๆ
                    </span>
                    <input
                      value={form.otherEventType}
                      onChange={(event) =>
                        updateForm("otherEventType", event.target.value)
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold outline-none focus:border-zinc-400 focus:bg-white"
                    />
                  </label>
                )}

                <div>
                  <span className="text-sm font-black text-zinc-800">
                    ประเภทไฟล์
                  </span>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[
                      ["still", "ภาพนิ่ง"],
                      ["video", "วิดีโอ"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateForm("mediaType", value)}
                        className="min-h-12 rounded-2xl border px-3 text-sm font-black"
                        style={
                          form.mediaType === value
                            ? {
                                backgroundColor: theme.primary,
                                borderColor: theme.primary,
                                color: "white",
                              }
                            : {
                                backgroundColor: "white",
                                borderColor: "#e4e4e7",
                                color: "#3f3f46",
                              }
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <label>
                  <span className="text-sm font-black text-zinc-800">
                    ชนิดงานที่จะส่ง
                  </span>
                  <select
                    value={form.deliveryType}
                    onChange={(event) =>
                      updateForm("deliveryType", event.target.value)
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold capitalize outline-none focus:border-zinc-400 focus:bg-white"
                  >
                    {(DELIVERY_TYPES[form.mediaType] || []).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div
                className="mt-5 rounded-2xl border px-4 py-4"
                style={{
                  backgroundColor: theme.soft,
                  borderColor: `${theme.primary}22`,
                }}
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
                  ชื่อโฟลเดอร์ Google Drive
                </p>
                <p
                  className="mt-2 break-words text-base font-black"
                  style={{ color: theme.primary }}
                >
                  {folderName || "กรอกข้อมูลเพื่อสร้างชื่อโฟลเดอร์"}
                </p>
              </div>

              <label className="mt-5 block cursor-pointer rounded-[24px] border-2 border-dashed border-zinc-300 bg-zinc-50 px-5 py-8 text-center transition hover:bg-white">
                <input
                  type="file"
                  multiple
                  accept={form.mediaType === "video" ? "video/*" : "image/*"}
                  className="sr-only"
                  onChange={(event) => {
                    const selectedFiles = Array.from(
                      event.target.files || []
                    );

                    setFiles(selectedFiles);
                    setProgress({});
                    setDelivery(null);
                    setMessage("");
                    setError("");
                    setUploadStats({
                      startedAt: 0,
                      totalBytes: selectedFiles.reduce(
                        (sum, file) => sum + file.size,
                        0
                      ),
                      completedBytes: 0,
                      currentFileLoaded: 0,
                      currentFileIndex: 0,
                      completedFiles: 0,
                      currentFileName: "",
                    });
                  }}
                />

                <span
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black"
                  style={{
                    backgroundColor: theme.soft,
                    color: theme.primary,
                  }}
                >
                  ↑
                </span>
                <p className="mt-3 text-base font-black text-zinc-800">
                  อัปโหลดไฟล์ภาพและวิดีโอ
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-500">
                  เลือกได้หลายไฟล์ และอัปโหลดตรงไปยัง Google Drive
                </p>
              </label>

              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.map((file) => (
                    <div
                      key={`${file.name}-${file.size}`}
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-bold text-zinc-700">
                          {file.name}
                        </p>
                        <span className="shrink-0 text-xs font-black text-zinc-400">
                          {progress[file.name] ?? 0}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progress[file.name] ?? 0}%`,
                            backgroundColor: theme.primary,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {error}
                </p>
              )}

              {message && (
                <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                  {message}
                </p>
              )}

              {delivery?.shareLink && (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">
                    ลิงก์ส่งงาน
                  </p>
                  <p className="mt-2 break-all text-sm font-semibold text-zinc-700">
                    {delivery.shareLink}
                  </p>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="mt-3 min-h-10 rounded-xl px-4 text-sm font-black text-white"
                    style={{ backgroundColor: theme.primary }}
                  >
                    คัดลอกลิงก์ Google Drive
                  </button>
                </div>
              )}

              <div className="mt-5 grid gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  disabled={working}
                  onClick={() => saveWork(false)}
                  className="min-h-12 rounded-2xl text-sm font-black text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.primary }}
                >
                  {working ? "กำลังทำงาน..." : "บันทึก"}
                </button>

                <button
                  type="button"
                  disabled={working}
                  onClick={saveDraft}
                  className="min-h-12 rounded-2xl border border-zinc-200 bg-white text-sm font-black text-zinc-700 disabled:opacity-50"
                >
                  บันทึกฉบับร่าง
                </button>

                <button
                  type="button"
                  disabled={working}
                  onClick={() => saveWork(true)}
                  className="min-h-12 rounded-2xl text-sm font-black text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.accent }}
                >
                  ส่งงาน
                </button>

                <button
                  type="button"
                  disabled={working}
                  onClick={() => router.push(`/${brand}/dashboard`)}
                  className="min-h-12 rounded-2xl border border-red-200 bg-red-50 text-sm font-black text-red-600 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </div>
            </section>

            <aside className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    Drafts
                  </p>
                  <h2 className="mt-1 text-lg font-black text-zinc-900">
                    ฉบับร่าง
                  </h2>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">
                  {drafts.length}
                </span>
              </div>

              {drafts.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {drafts.map((draft) => (
                    <article
                      key={draft.id}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"
                    >
                      <p className="truncate text-sm font-black text-zinc-800">
                        {draft.folderName ||
                          draft.form?.customerName ||
                          "ฉบับร่าง"}
                      </p>
                      <p className="mt-1 text-xs font-medium text-zinc-400">
                        {new Date(draft.savedAt).toLocaleString("th-TH")}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => openDraft(draft)}
                          className="min-h-9 rounded-xl text-xs font-black text-white"
                          style={{ backgroundColor: theme.primary }}
                        >
                          เปิดร่าง
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteDraft(draft.id)}
                          className="min-h-9 rounded-xl border border-red-200 bg-red-50 text-xs font-black text-red-600"
                        >
                          ลบร่าง
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                  ยังไม่มีฉบับร่าง
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

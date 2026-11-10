"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import type { EquipmentImage } from "@/lib/equipment/types";
import {
  validateImageFile,
  type ImageManifest,
} from "@/lib/equipment/image-validation";
import { api } from "./ui";
const imageApi = "/api/equipment/images";
export const imageSrc = (id: string, thumbnail = false) =>
  `${imageApi}?id=${id}${thumbnail ? "&thumbnail=1" : ""}`;
export function ImagePlaceholder() {
  return (
    <span
      className="grid aspect-square h-full min-h-10 w-full place-items-center rounded-xl bg-[#F6F7F3] text-[#8C9B91]"
      aria-label="ไม่มีรูปภาพ"
    >
      <svg
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m3 17 5-5 4 4 4-6 5 7" />
      </svg>
    </span>
  );
}
export function ImageLightbox({
  images,
  index,
  close,
  change,
}: {
  images: { id: string; filename: string; src?: string }[];
  index: number;
  close: () => void;
  change: (n: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const current = images[index];
  if (!current) return null;
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
      aria-label="ดูรูปภาพอุปกรณ์"
      className="m-auto w-[min(1100px,96vw)] max-w-none rounded-2xl bg-[#10231C] p-3 text-white shadow-2xl backdrop:bg-black/75"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") change((index + 1) % images.length);
        if (e.key === "ArrowLeft")
          change((index - 1 + images.length) % images.length);
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="truncate">
          {index + 1} / {images.length} · {current.filename}
        </span>
        <button
          type="button"
          onClick={close}
          className="min-h-11 rounded-lg px-4 hover:bg-white/10"
          aria-label="ปิดรูปภาพ"
        >
          ✕
        </button>
      </div>
      <div className="relative h-[65dvh]">
        <Image
          src={current.src || imageSrc(current.id)}
          alt={current.filename}
          fill
          unoptimized
          className="object-contain"
          sizes="95vw"
        />
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex justify-between">
          <button
            type="button"
            className="min-h-11 rounded-lg px-4 hover:bg-white/10"
            onClick={() => change((index - 1 + images.length) % images.length)}
          >
            ← รูปก่อนหน้า
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg px-4 hover:bg-white/10"
            onClick={() => change((index + 1) % images.length)}
          >
            รูปถัดไป →
          </button>
        </div>
      )}
    </dialog>
  );
}
export function ImageGallery({
  images,
  name,
}: {
  images: EquipmentImage[];
  name: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const ordered = [...images].sort(
    (a, b) =>
      Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order,
  );
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-label={`ดูรูปภาพ ${name}`}
        disabled={!ordered.length}
        onClick={() => setIndex(0)}
        className="relative block aspect-square w-full overflow-hidden rounded-2xl border border-[#DDE5DC] bg-[#F6F7F3]"
      >
        {ordered[0] ? (
          <Image
            src={imageSrc(ordered[0].id)}
            alt={name}
            fill
            unoptimized
            className="object-cover"
            sizes="(min-width:640px) 30vw, 90vw"
          />
        ) : (
          <ImagePlaceholder />
        )}
      </button>
      {ordered.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {ordered.map((im, n) => (
            <button
              key={im.id}
              type="button"
              className="relative aspect-square overflow-hidden rounded-lg border border-[#DDE5DC]"
              onClick={() => setIndex(n)}
              aria-label={`เปิดรูป ${n + 1} ${im.is_cover ? "รูปหลัก" : ""}`}
            >
              <Image
                src={imageSrc(im.id, true)}
                alt={im.filename}
                fill
                unoptimized
                className="object-cover"
                sizes="90px"
              />
            </button>
          ))}
        </div>
      )}
      {index !== null && (
        <ImageLightbox
          images={ordered}
          index={index}
          close={() => setIndex(null)}
          change={setIndex}
        />
      )}
    </div>
  );
}
type SelectedImage = EquipmentImage & {
  localId: string;
  src?: string;
  file?: File;
  state: "ready" | "uploading" | "error";
  progress: number;
  error?: string;
};
export function EquipmentImageEditor({
  equipmentId,
  disabled,
  onChange,
}: {
  equipmentId?: string;
  disabled: boolean;
  onChange: (manifest: ImageManifest | null) => void;
}) {
  const [items, setItems] = useState<SelectedImage[]>([]),
    [cover, setCover] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!!equipmentId),
    [dragging, setDragging] = useState(false),
    [preview, setPreview] = useState<number | null>(null);
  const [draft] = useState(() => crypto.randomUUID());
  const inputId = useId(),
    fileInput = useRef<HTMLInputElement>(null),
    replace = useRef<string | null>(null),
    active = useRef(true),
    uploaded = useRef(new Set<string>()),
    localUrls = useRef(new Set<string>()),
    requests = useRef(new Set<XMLHttpRequest>()),
    removed = useRef(new Set<string>());
  async function cancel(id: string) {
    try {
      await fetch(imageApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", id }),
        keepalive: true,
      });
    } catch {
      /* Tracked uploads expire and are swept on the next inventory visit. */
    }
  }
  useEffect(() => {
    active.current = true;
    let ignore = false;
    const pendingRequests = requests.current,
      stagedIds = uploaded.current,
      previews = localUrls.current;
    if (equipmentId)
      void api<{ images: EquipmentImage[] }>(
        `${imageApi}?equipment_id=${equipmentId}`,
      )
        .then((r) => {
          if (ignore) return;
          setItems(
            r.images.map((im) => ({
              ...im,
              localId: im.id,
              state: "ready",
              progress: 100,
            })),
          );
          setCover(
            r.images.find((im) => im.is_cover)?.id || r.images[0]?.id || "",
          );
          setLoading(false);
        })
        .catch((e) => {
          if (!ignore) {
            setError(e.message);
            setLoading(true);
          }
        });
    return () => {
      ignore = true;
      active.current = false;
      pendingRequests.forEach((r) => r.abort());
      stagedIds.forEach((id) => void cancel(id));
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [equipmentId]);
  useEffect(() => {
    const coverItem = items.find((im) => im.localId === cover) || items[0];
    onChange(
      loading || items.some((im) => im.state !== "ready")
        ? null
        : {
            ids: items.map((im) => im.id),
            cover_id: coverItem?.id || "",
            draft_id: draft,
          },
    );
  }, [items, cover, draft, loading, onChange]);
  function patch(localId: string, update: Partial<SelectedImage>) {
    if (active.current)
      setItems((list) =>
        list.map((im) => (im.localId === localId ? { ...im, ...update } : im)),
      );
  }
  async function upload(item: SelectedImage) {
    try {
      const file = item.file!;
      const prep = await api<{ id: string; upload_url: string }>(imageApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          draft_id: draft,
          equipment_id: equipmentId,
          filename: file.name,
          mime_type: file.type,
          size: file.size,
        }),
      });
      uploaded.current.add(prep.id);
      if (!active.current || removed.current.has(item.localId)) {
        void cancel(prep.id);
        return;
      }
      patch(item.localId, { id: prep.id });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        requests.current.add(xhr);
        xhr.open("PUT", prep.upload_url);
        xhr.setRequestHeader("Content-Type", validateImageFile(file));
        xhr.setRequestHeader("x-upsert", "false");
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (key) xhr.setRequestHeader("apikey", key);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable)
            patch(item.localId, {
              progress: Math.round((ev.loaded / ev.total) * 90),
            });
        };
        const done = () => requests.current.delete(xhr);
        xhr.onload = () => {
          done();
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่"));
        };
        xhr.onerror = () => {
          done();
          reject(new Error("การเชื่อมต่อขัดข้อง กรุณาลองอัปโหลดใหม่"));
        };
        xhr.onabort = () => {
          done();
          reject(new Error("ยกเลิกการอัปโหลด"));
        };
        xhr.timeout = 120000;
        xhr.ontimeout = () => {
          done();
          reject(new Error("อัปโหลดนานเกินไป กรุณาลองใหม่"));
        };
        xhr.send(file);
      });
      await api(imageApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", id: prep.id }),
      });
      if (!active.current || removed.current.has(item.localId)) {
        void cancel(prep.id);
        return;
      }
      patch(item.localId, {
        id: prep.id,
        state: "ready",
        progress: 100,
        error: undefined,
      });
    } catch (e) {
      patch(item.localId, { state: "error", error: (e as Error).message });
    }
  }
  function choose(files: FileList | File[]) {
    const values = Array.from(files),
      replacing = replace.current;
    replace.current = null;
    const current = items;
    if (current.length - (replacing ? 1 : 0) + values.length > 5) {
      setError("เพิ่มรูปภาพได้สูงสุด 5 รูปต่ออุปกรณ์");
      return;
    }
    try {
      values.forEach(validateImageFile);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setError("");
    const additions = values.map((file) => {
      const localId = crypto.randomUUID(),
        src = URL.createObjectURL(file);
      localUrls.current.add(src);
      return {
        id: "",
        localId,
        src,
        file,
        filename: file.name,
        is_cover: false,
        sort_order: 0,
        state: "uploading" as const,
        progress: 0,
      };
    });
    if (!additions.length) return;
    if (replacing) {
      removed.current.add(replacing);
      const old = current.find((im) => im.localId === replacing);
      if (old && uploaded.current.has(old.id)) void cancel(old.id);
      setItems((list) =>
        list.flatMap((im) => (im.localId === replacing ? additions : [im])),
      );
      if (cover === replacing) setCover(additions[0].localId);
    } else {
      setItems((list) => [...list, ...additions]);
      if (!current.length) setCover(additions[0].localId);
    }
    // Start after React has committed the immediate local thumbnails.
    queueMicrotask(() => additions.forEach((im) => void upload(im)));
  }
  function remove(im: SelectedImage) {
    removed.current.add(im.localId);
    setItems((list) => list.filter((row) => row.localId !== im.localId));
    if (im.localId === cover)
      setCover(items.find((row) => row.localId !== im.localId)?.localId || "");
    if (uploaded.current.has(im.id)) void cancel(im.id);
  }
  function move(n: number, delta: number) {
    setItems((list) => {
      const next = [...list],
        to = n + delta;
      [next[n], next[to]] = [next[to], next[n]];
      return next;
    });
  }
  return (
    <section
      className="col-span-full space-y-3"
      aria-label="Equipment Images · รูปภาพอุปกรณ์"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-[#10231C]">
          Equipment Images · รูปภาพอุปกรณ์
        </h3>
        <span className="text-xs text-[#66756D]">
          {items.length} / 5 Images
        </span>
      </div>
      <input
        id={inputId}
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        className="sr-only"
        disabled={disabled || loading}
        onChange={(ev) => {
          if (ev.target.files) choose(ev.target.files);
          ev.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => {
          replace.current = null;
          if (fileInput.current) {
            fileInput.current.multiple = true;
            fileInput.current.click();
          }
        }}
        onDragOver={(ev) => {
          ev.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(ev) => {
          ev.preventDefault();
          setDragging(false);
          if (!disabled && !loading) choose(ev.dataTransfer.files);
        }}
        className={`grid min-h-32 w-full place-content-center gap-2 rounded-2xl border border-dashed p-5 text-center transition disabled:opacity-50 ${dragging ? "border-[#183024] bg-[#EDF2EB]" : "border-[#CBD5CD] bg-[#FAFBF8] hover:bg-[#F2F5EF]"}`}
      >
        <span className="mx-auto w-9">
          <ImagePlaceholder />
        </span>
        <span className="text-sm font-medium">
          คลิกเพื่ออัปโหลด หรือลากรูปภาพมาวาง
        </span>
        <span className="text-xs text-[#66756D]">
          JPG, PNG, WEBP · สูงสุด 10 MB ต่อรูป · ไม่เกิน 5 รูป
        </span>
      </button>
      {loading && (
        <p className="text-xs text-[#66756D]">
          กำลังโหลดรูปเดิม หากโหลดไม่สำเร็จให้ปิดฟอร์มแล้วเปิดใหม่
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((im, n) => (
          <article
            key={im.localId}
            className={`min-w-0 overflow-hidden rounded-xl border bg-white ${im.localId === cover ? "border-[#183024] ring-1 ring-[#183024]" : "border-[#DDE5DC]"}`}
          >
            <button
              type="button"
              className="relative block aspect-[4/3] w-full bg-[#F6F7F3]"
              onClick={() => setPreview(n)}
              aria-label={`ขยายรูป ${n + 1}`}
            >
              <Image
                src={im.src || imageSrc(im.id, true)}
                alt={im.filename}
                fill
                unoptimized
                className="object-cover"
                sizes="(min-width:640px) 220px, 45vw"
              />
              {im.localId === cover && (
                <span className="absolute left-2 top-2 rounded-full bg-[#183024] px-2 py-1 text-[10px] text-white">
                  รูปหลัก
                </span>
              )}
            </button>
            <div className="space-y-2 p-2">
              <p className="truncate text-xs" title={im.filename}>
                {im.filename}
              </p>
              {im.state === "uploading" ? (
                <div aria-live="polite">
                  <progress
                    className="h-1.5 w-full accent-[#183024]"
                    value={im.progress}
                    max="100"
                    aria-label={`อัปโหลด ${im.filename}`}
                  />
                  <p className="text-[10px] text-[#66756D]">
                    {im.progress >= 90
                      ? "กำลังตรวจสอบรูปภาพ…"
                      : `อัปโหลด ${im.progress}%`}
                  </p>
                </div>
              ) : im.state === "error" ? (
                <p className="text-xs text-red-700" role="alert">
                  {im.error}
                </p>
              ) : (
                <p className="text-[10px] text-green-800">✓ พร้อมบันทึก</p>
              )}
              <div className="flex flex-wrap gap-x-3 text-[11px]">
                {im.localId !== cover && (
                  <button
                    type="button"
                    disabled={disabled}
                    className="min-h-9 underline"
                    onClick={() => setCover(im.localId)}
                  >
                    ตั้งเป็นรูปหลัก
                  </button>
                )}
                <button
                  type="button"
                  disabled={disabled || im.state === "uploading"}
                  className="min-h-9 underline"
                  onClick={() => {
                    replace.current = im.localId;
                    if (fileInput.current) {
                      fileInput.current.multiple = false;
                      fileInput.current.click();
                    }
                  }}
                >
                  เปลี่ยนรูป
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  className="min-h-9 text-red-700 underline"
                  onClick={() => remove(im)}
                >
                  ลบรูป
                </button>
              </div>
              <div className="flex justify-between text-xs">
                <button
                  type="button"
                  disabled={disabled || n === 0}
                  aria-label={`เลื่อนรูป ${n + 1} ไปก่อนหน้า`}
                  className="min-h-9 px-2 disabled:opacity-25"
                  onClick={() => move(n, -1)}
                >
                  ←
                </button>
                <span className="self-center text-[10px] text-[#66756D]">
                  {n + 1}
                </span>
                <button
                  type="button"
                  disabled={disabled || n === items.length - 1}
                  aria-label={`เลื่อนรูป ${n + 1} ไปถัดไป`}
                  className="min-h-9 px-2 disabled:opacity-25"
                  onClick={() => move(n, 1)}
                >
                  →
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="text-xs text-[#66756D]">
        รูปหลักใช้แสดงในคลังอุปกรณ์ · การเพิ่ม ลบ
        และจัดลำดับจะมีผลเมื่อบันทึกข้อมูลสำเร็จ ·
        ภาพจะถูกปรับขนาดสำหรับแสดงบนเว็บ
      </p>
      {preview !== null && items[preview] && (
        <ImageLightbox
          images={items}
          index={preview}
          close={() => setPreview(null)}
          change={setPreview}
        />
      )}
    </section>
  );
}

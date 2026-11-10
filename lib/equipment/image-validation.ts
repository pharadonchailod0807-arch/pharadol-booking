import { EquipmentError, uuid } from "./validation.ts";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 5;
export type ImageManifest = {
  ids: string[];
  cover_id: string;
  draft_id: string;
};
export function validateImageFile(file: {
  name: string;
  type: string;
  size: number;
}) {
  if (/\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type))
    throw new EquipmentError(
      "ยังไม่รองรับ HEIC กรุณาแปลงเป็น JPG, PNG หรือ WEBP ก่อนอัปโหลด",
    );
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > MAX_IMAGE_BYTES
  )
    throw new EquipmentError("รูปภาพต้องมีขนาดไม่เกิน 10 MB ต่อรูป");
  const ext = file.name.split(".").pop()?.toLowerCase();
  const expected =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "";
  if (
    !expected ||
    (file.type &&
      file.type !== expected &&
      !(expected === "image/jpeg" && file.type === "image/jpg"))
  )
    throw new EquipmentError("รองรับรูปภาพ JPG, JPEG, PNG และ WEBP เท่านั้น");
  return expected;
}
export function validateImageManifest(value: unknown): ImageManifest {
  const m = value as Partial<ImageManifest> | null;
  if (!m || !Array.isArray(m.ids) || m.ids.length > MAX_IMAGES)
    throw new EquipmentError("เพิ่มรูปภาพได้สูงสุด 5 รูปต่ออุปกรณ์");
  const ids = m.ids.map(uuid);
  if (new Set(ids).size !== ids.length)
    throw new EquipmentError("พบรูปภาพซ้ำ กรุณาโหลดใหม่");
  const cover_id = ids.length ? uuid(m.cover_id) : "";
  if (ids.length && !ids.includes(cover_id))
    throw new EquipmentError("กรุณาเลือกรูปหลัก");
  return { ids, cover_id, draft_id: uuid(m.draft_id) };
}

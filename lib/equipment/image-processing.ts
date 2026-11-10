import sharp from "sharp";
import { EquipmentError } from "./validation.ts";
import { MAX_IMAGE_BYTES } from "./image-validation.ts";
export async function normalizeEquipmentImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new EquipmentError("รูปภาพต้องมีขนาดไม่เกิน 10 MB ต่อรูป");
  try {
    const input = sharp(bytes, {
      limitInputPixels: 64000000,
      failOn: "warning",
      animated: false,
    });
    const meta = await input.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format || "") ||
      (meta.pages || 1) > 1
    )
      throw new Error("Unsupported image");
    const image = await input
      .rotate()
      .resize(2560, 2560, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(image.data)
      .resize(240, 240, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return {
      bytes: image.data,
      thumbnail,
      width: image.info.width,
      height: image.info.height,
    };
  } catch {
    throw new EquipmentError(
      "ไม่สามารถอ่านรูปนี้ได้ ไฟล์อาจเสียหายหรือไม่ใช่รูปภาพ JPG, PNG, WEBP ที่รองรับ",
    );
  }
}

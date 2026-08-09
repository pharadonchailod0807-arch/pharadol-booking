import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { canAccessMemberBrand, getSessionUserFromRequest } from "@/lib/members";
import { can } from "@/lib/rbac";
import { normalizeBrand, rejectCrossSiteRequest, sanitizeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const fileSignatureMatches = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
};

export async function POST(request) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ success: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const brand = normalizeBrand(formData?.get("brand"));
  const memberId = sanitizeText(formData?.get("memberId"), 120) || "new";

  if (!brand) {
    return Response.json({ success: false, error: "ไม่พบแบรนด์" }, { status: 400 });
  }
  if (!canAccessMemberBrand(user, brand)) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์อัปโหลดรูปโปรไฟล์แบรนด์นี้" }, { status: 403 });
  }
  const requiredPermission = memberId === "new" ? "members.create" : "members.edit";
  if (!can(user, requiredPermission, { brandId: brand })) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์อัปโหลดรูปโปรไฟล์แบรนด์นี้" }, { status: 403 });
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json({ success: false, error: "ไม่พบไฟล์รูปโปรไฟล์" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ success: false, error: "รองรับเฉพาะ JPG, PNG และ WebP" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ success: false, error: "รูปโปรไฟล์ต้องมีขนาดไม่เกิน 5 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!fileSignatureMatches(buffer, file.type)) {
    return Response.json({ success: false, error: "ชนิดไฟล์รูปโปรไฟล์ไม่ตรงกับเนื้อหาไฟล์" }, { status: 400 });
  }

  const extension = EXTENSIONS[file.type] || "jpg";
  const path = `${brand}/${memberId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("member-profiles")
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    return Response.json({ success: false, error: "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ" }, { status: 500 });
  }

  const { data } = supabase.storage.from("member-profiles").getPublicUrl(path);
  return Response.json({ success: true, url: data?.publicUrl || "", path });
}

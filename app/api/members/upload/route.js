import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { canAccessMemberBrand, getSessionUserFromRequest } from "@/lib/members";
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

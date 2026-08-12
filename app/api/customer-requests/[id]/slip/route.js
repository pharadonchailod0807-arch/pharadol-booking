import { google } from "googleapis";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { supabase } from "@/lib/supabase";
import {
  getClientIp,
  normalizeBrand,
  rateLimit,
  rejectCrossSiteRequest,
  sanitizeText,
} from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VALID_BRANDS = new Set(["pharadol", "adisorn"]);
const MAX_SLIP_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const EXTENSION_BY_MIME = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const BRAND_CONFIG = {
  pharadol: {
    name: "Pharadol",
    clientId: process.env.PHARADOL_GOOGLE_CLIENT_ID,
    clientSecret: process.env.PHARADOL_GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.PHARADOL_GOOGLE_REFRESH_TOKEN,
    folderId: process.env.PHARADOL_GOOGLE_DRIVE_FOLDER_ID,
  },
  adisorn: {
    name: "Adisorn",
    clientId: process.env.ADISORN_GOOGLE_CLIENT_ID,
    clientSecret: process.env.ADISORN_GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.ADISORN_GOOGLE_REFRESH_TOKEN,
    folderId: process.env.ADISORN_GOOGLE_DRIVE_FOLDER_ID,
  },
};

const getFolderId = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/folders\/([^/?#]+)/);
  return match?.[1] || raw;
};

const getDriveContext = (brand) => {
  const config = BRAND_CONFIG[brand];
  if (!config) throw new Error("ไม่พบแบรนด์สำหรับ Google Drive");

  const parentFolderId = getFolderId(config.folderId);
  if (
    !config.clientId ||
    !config.clientSecret ||
    !config.refreshToken ||
    !parentFolderId
  ) {
    throw new Error(`ตั้งค่า Google Drive ของ ${config.name} ไม่ครบ`);
  }

  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
  auth.setCredentials({ refresh_token: config.refreshToken });

  return {
    drive: google.drive({ version: "v3", auth }),
    parentFolderId,
  };
};

const readAscii = (buffer, start, end) =>
  buffer.subarray(start, end).toString("ascii");

const detectMimeType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return "";

  if (readAscii(buffer, 0, 4) === "%PDF") return "application/pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (readAscii(buffer, 0, 4) === "RIFF" && readAscii(buffer, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (readAscii(buffer, 4, 8) === "ftyp") {
    const brands = readAscii(buffer, 8, Math.min(buffer.length, 32));
    if (/(heic|heix|hevc|hevx)/.test(brands)) return "image/heic";
    if (/(heif|mif1|msf1)/.test(brands)) return "image/heif";
  }

  return "";
};

const getReadableError = (error) => {
  const message = String(error?.message || error || "");
  if (message.includes("customer_requests")) {
    return "ยังไม่ได้สร้างตาราง customer_requests ใน Supabase กรุณารันไฟล์ supabase-customer-requests.sql";
  }
  return message || "ไม่สามารถแนบสลิปได้ในขณะนี้ กรุณาลองใหม่";
};

export async function POST(request, context) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  try {
    const params = await context.params;
    const id = sanitizeText(params?.id, 80);
    const formData = await request.formData().catch(() => null);

    if (!formData) {
      return Response.json(
        { success: false, error: "ข้อมูลอัปโหลดไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const brand = normalizeBrand(formData.get("brand"));
    const phone = sanitizeText(formData.get("phone"), 80);

    if (!id || !VALID_BRANDS.has(brand) || !phone) {
      return Response.json(
        { success: false, error: "ข้อมูลคำขอไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const limited = rateLimit({
      key: `customer-slip:${brand}:${id}:${getClientIp(request)}`,
      limit: 6,
      windowMs: 10 * 60 * 1000,
      message: "อัปโหลดสลิปบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
    });
    if (limited) return limited;

    const { data: existingRequest, error: requestError } = await supabase
      .from("customer_requests")
      .select("id,brand,phone,deleted_at")
      .eq("id", id)
      .eq("brand", brand)
      .is("deleted_at", null)
      .maybeSingle();

    if (requestError) {
      return Response.json(
        { success: false, error: getReadableError(requestError) },
        { status: 500 }
      );
    }

    if (!existingRequest) {
      return Response.json(
        { success: false, error: "ไม่พบคำขอนี้" },
        { status: 404 }
      );
    }

    if (sanitizeText(existingRequest.phone, 80) !== phone) {
      return Response.json(
        { success: false, error: "ข้อมูลยืนยันคำขอไม่ถูกต้อง" },
        { status: 403 }
      );
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return Response.json(
        { success: false, error: "ไม่พบไฟล์สลิป" },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return Response.json(
        { success: false, error: "ไฟล์สลิปไม่มีข้อมูล" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SLIP_BYTES) {
      return Response.json(
        { success: false, error: "รูปสลิปมีขนาดใหญ่เกินไป กรุณาเลือกรูปอื่น" },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const actualMimeType = detectMimeType(buffer);

    if (!actualMimeType || !ALLOWED_MIME_TYPES.has(actualMimeType)) {
      return Response.json(
        { success: false, error: "รองรับเฉพาะไฟล์ JPG, PNG, WEBP, HEIC, HEIF หรือ PDF" },
        { status: 415 }
      );
    }

    const { drive, parentFolderId } = getDriveContext(brand);
    const originalName = sanitizeText(file.name, 180) || "customer-slip";
    const extension = EXTENSION_BY_MIME[actualMimeType] || "jpg";
    const driveFileName = `customer-slip-${brand}-${id}-${Date.now()}-${randomUUID()}.${extension}`;

    const { data: uploadedFile } = await drive.files.create({
      supportsAllDrives: true,
      fields: "id,name,webViewLink,webContentLink",
      requestBody: {
        name: driveFileName,
        parents: [parentFolderId],
      },
      media: {
        mimeType: actualMimeType,
        body: Readable.from(buffer),
      },
    });

    await drive.permissions.create({
      fileId: uploadedFile.id,
      supportsAllDrives: true,
      sendNotificationEmail: false,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    const { data: sharedFile } = await drive.files.get({
      fileId: uploadedFile.id,
      supportsAllDrives: true,
      fields: "id,name,webViewLink,webContentLink",
    });

    const slipUrl =
      actualMimeType === "application/pdf"
        ? sharedFile.webViewLink || sharedFile.webContentLink || ""
        : sharedFile.webContentLink || sharedFile.webViewLink || "";

    const { data: updatedRequest, error: updateError } = await supabase
      .from("customer_requests")
      .update({
        slip_url: sanitizeText(slipUrl, 1200),
        slip_file_name: originalName,
        slip_file_type: actualMimeType,
      })
      .eq("id", id)
      .eq("brand", brand)
      .is("deleted_at", null)
      .select()
      .single();

    if (updateError) {
      return Response.json(
        { success: false, error: getReadableError(updateError) },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      url: slipUrl,
      fileId: sharedFile.id || "",
      fileName: originalName,
      fileType: actualMimeType,
      request: {
        id: updatedRequest.id,
        brand: updatedRequest.brand,
        slipUrl: updatedRequest.slip_url || "",
        slipFileName: updatedRequest.slip_file_name || "",
        slipFileType: updatedRequest.slip_file_type || "",
      },
    });
  } catch (error) {
    console.error("Customer slip upload error", {
      message: String(error?.message || error || ""),
    });

    return Response.json(
      {
        success: false,
        error: "ไม่สามารถแนบสลิปได้ในขณะนี้ กรุณาลองใหม่",
      },
      { status: 500 }
    );
  }
}

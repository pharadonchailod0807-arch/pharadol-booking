import { google } from "googleapis";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { supabase, supabaseServer } from "@/lib/supabase";
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
const MAX_SLIP_BYTES = 4 * 1024 * 1024;
const MAX_INLINE_FALLBACK_BYTES = MAX_SLIP_BYTES;
const MAX_INLINE_SLIP_URL_LENGTH =
  Math.ceil((MAX_INLINE_FALLBACK_BYTES * 4) / 3) + 128;
const SUPABASE_SLIP_BUCKET = "customer-slips";
const UPLOAD_ENDPOINT = "/api/customer-requests/[id]/slip";
const ERROR_MESSAGES = {
  SLIP_INVALID_FORM: "ข้อมูลอัปโหลดไม่ถูกต้อง",
  SLIP_INVALID_REQUEST: "ข้อมูลคำขอไม่ถูกต้อง",
  SLIP_RATE_LIMITED: "อัปโหลดสลิปบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  SLIP_REQUEST_LOOKUP_FAILED: "ไม่สามารถตรวจสอบคำขอได้",
  SLIP_REQUEST_NOT_FOUND: "ไม่พบคำขอนี้",
  SLIP_REQUEST_FORBIDDEN: "ข้อมูลยืนยันคำขอไม่ถูกต้อง",
  SLIP_FILE_MISSING: "ไม่พบไฟล์สลิป",
  SLIP_EMPTY_FILE: "ไฟล์สลิปไม่มีข้อมูล",
  SLIP_TOO_LARGE: "รูปสลิปมีขนาดใหญ่เกินไป กรุณาเลือกรูปอื่น",
  SLIP_UNSUPPORTED: "รองรับเฉพาะไฟล์ JPG, PNG, WEBP, HEIC, HEIF หรือ PDF",
  SLIP_ENV_MISSING: "ตั้งค่า Google Drive ไม่ครบ",
  SLIP_STORAGE_AUTH_ERROR: "ไม่สามารถเชื่อมต่อ Google Drive ได้",
  SLIP_STORAGE_PERMISSION_ERROR: "ไม่มีสิทธิ์อัปโหลดหรือแชร์ไฟล์ใน Google Drive",
  SLIP_STORAGE_ERROR: "ไม่สามารถบันทึกสลิปไปยัง Google Drive ได้",
  SLIP_ATTACH_ERROR: "บันทึกลิงก์สลิปเข้าคำขอไม่สำเร็จ",
  SLIP_UPLOAD_FAILED: "ไม่สามารถแนบสลิปได้ในขณะนี้ กรุณาลองใหม่",
};
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

const DRIVE_ENV_NAMES = {
  pharadol: [
    "PHARADOL_GOOGLE_CLIENT_ID",
    "PHARADOL_GOOGLE_CLIENT_SECRET",
    "PHARADOL_GOOGLE_REFRESH_TOKEN",
    "PHARADOL_GOOGLE_DRIVE_FOLDER_ID",
  ],
  adisorn: [
    "ADISORN_GOOGLE_CLIENT_ID",
    "ADISORN_GOOGLE_CLIENT_SECRET",
    "ADISORN_GOOGLE_REFRESH_TOKEN",
    "ADISORN_GOOGLE_DRIVE_FOLDER_ID",
  ],
};

const getFolderId = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/folders\/([^/?#]+)/);
  return match?.[1] || raw;
};

const getMissingDriveEnvNames = (brand) =>
  (DRIVE_ENV_NAMES[brand] || []).filter(
    (name) => !String(process.env[name] || "").trim()
  );

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
    const error = new Error(`ตั้งค่า Google Drive ของ ${config.name} ไม่ครบ`);
    error.code = "SLIP_ENV_MISSING";
    error.missingEnv = getMissingDriveEnvNames(brand);
    throw error;
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

const getGoogleErrorDetail = (error) => {
  const status = Number(error?.code || error?.status || error?.response?.status || 0);
  const reason =
    error?.errors?.[0]?.reason ||
    error?.response?.data?.error ||
    error?.response?.data?.error_description ||
    "";
  const message =
    error?.errors?.[0]?.message ||
    error?.response?.data?.error_description ||
    error?.response?.data?.error ||
    error?.message ||
    "";

  return {
    status: Number.isFinite(status) ? status : 0,
    reason: sanitizeText(reason, 160),
    message: sanitizeText(message, 240),
  };
};

const getStorageErrorCode = (error) => {
  if (error?.code === "SLIP_ENV_MISSING") return "SLIP_ENV_MISSING";

  const { status, reason, message } = getGoogleErrorDetail(error);
  const detail = `${reason} ${message}`.toLowerCase();

  if (status === 401 || detail.includes("invalid_grant")) {
    return "SLIP_STORAGE_AUTH_ERROR";
  }

  if (
    status === 403 ||
    detail.includes("insufficient") ||
    detail.includes("permission") ||
    detail.includes("forbidden")
  ) {
    return "SLIP_STORAGE_PERMISSION_ERROR";
  }

  return "SLIP_STORAGE_ERROR";
};

const canUseInlineSlipFallback = (code, buffer) =>
  [
    "SLIP_ENV_MISSING",
    "SLIP_STORAGE_AUTH_ERROR",
    "SLIP_STORAGE_PERMISSION_ERROR",
    "SLIP_STORAGE_ERROR",
  ].includes(code) &&
  Buffer.isBuffer(buffer) &&
  buffer.length <= MAX_INLINE_FALLBACK_BYTES;

const createInlineSlipFile = ({ buffer, mimeType, originalName }) => {
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

  return {
    id: "",
    name: originalName,
    webViewLink: dataUrl,
    webContentLink: dataUrl,
    storageMode: "inline",
  };
};

const isMissingSupabaseBucketError = (error) => {
  const detail = `${error?.statusCode || ""} ${error?.error || ""} ${
    error?.message || ""
  }`.toLowerCase();

  return (
    detail.includes("404") ||
    detail.includes("bucket not found") ||
    detail.includes("not found")
  );
};

const ensureSupabaseSlipBucket = async (db) => {
  if (!db?.storage?.createBucket) return false;

  const { error } = await db.storage.createBucket(SUPABASE_SLIP_BUCKET, {
    public: true,
    fileSizeLimit: MAX_SLIP_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
  });

  return !error || String(error.message || "").toLowerCase().includes("already exists");
};

const uploadSupabaseSlipFallback = async ({
  db,
  buffer,
  brand,
  id,
  mimeType,
  extension,
  originalName,
}) => {
  if (!db?.storage?.from) {
    throw new Error("Supabase storage is not configured");
  }

  const path = `${brand}/${id}/${Date.now()}-${randomUUID()}.${extension}`;
  const bucket = db.storage.from(SUPABASE_SLIP_BUCKET);
  let uploadResult = await bucket.upload(path, buffer, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: false,
  });

  if (uploadResult.error && isMissingSupabaseBucketError(uploadResult.error)) {
    const bucketReady = await ensureSupabaseSlipBucket(db);
    if (bucketReady) {
      uploadResult = await bucket.upload(path, buffer, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: false,
      });
    }
  }

  if (uploadResult.error) throw uploadResult.error;

  const { data } = bucket.getPublicUrl(path);
  const publicUrl = data?.publicUrl || "";
  if (!publicUrl) throw new Error("Supabase storage did not return a public URL");

  return {
    id: path,
    name: originalName,
    webViewLink: publicUrl,
    webContentLink: publicUrl,
    storageMode: "supabase",
  };
};

const buildDiagnostics = (overrides = {}) => ({
  endpoint: UPLOAD_ENDPOINT,
  customerRequestId: "",
  brand: "",
  status: 0,
  errorCode: "",
  durationMs: 0,
  fileName: "",
  fileType: "",
  fileSize: 0,
  detectedFileType: "",
  driveFileId: "",
  googleStatus: 0,
  googleReason: "",
  missingEnv: [],
  supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE_KEY ? "PRESENT" : "MISSING",
  supabaseCode: "",
  ...overrides,
});

const logSlipUpload = (level, event, diagnostics = {}) => {
  const payload = buildDiagnostics(diagnostics);
  const logger = level === "error" ? console.error : console.info;
  logger(event, payload);
};

const logSlipUploadStep = (level, step, diagnostics = {}) => {
  const payload = buildDiagnostics(diagnostics);
  const logger = level === "error" ? console.error : console.log;
  logger(`[SLIP_UPLOAD] step=${step}`, payload);
};

const jsonError = ({
  status,
  code,
  message,
  diagnostics,
  detail = {},
}) => {
  const responseBody = {
    success: false,
    code,
    error: message || ERROR_MESSAGES[code] || ERROR_MESSAGES.SLIP_UPLOAD_FAILED,
  };

  const logDiagnostics = buildDiagnostics({
    ...diagnostics,
    status,
    errorCode: code,
  });

  logSlipUpload(status >= 500 ? "error" : "info", "Customer slip upload failed", {
    ...logDiagnostics,
    responseBody,
    ...detail,
  });

  return Response.json(responseBody, { status });
};

export async function POST(request, context) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const startedAt = Date.now();
  const diagnostics = {
    endpoint: UPLOAD_ENDPOINT,
    customerRequestId: "",
    brand: "",
    fileType: "",
    fileSize: 0,
    detectedFileType: "",
  };

  try {
    const params = await context.params;
    const id = sanitizeText(params?.id, 80);
    diagnostics.customerRequestId = id;
    const formData = await request.formData().catch(() => null);

    if (!formData) {
      return jsonError({
        status: 400,
        code: "SLIP_INVALID_FORM",
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    const brand = normalizeBrand(formData.get("brand"));
    diagnostics.brand = brand;
    const phone = sanitizeText(formData.get("phone"), 80);

    logSlipUploadStep("info", "received-form", {
      ...diagnostics,
      durationMs: Date.now() - startedAt,
    });

    if (!id || !VALID_BRANDS.has(brand) || !phone) {
      return jsonError({
        status: 400,
        code: "SLIP_INVALID_REQUEST",
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    const limited = rateLimit({
      key: `customer-slip:${brand}:${id}:${getClientIp(request)}`,
      limit: 6,
      windowMs: 10 * 60 * 1000,
      message: ERROR_MESSAGES.SLIP_RATE_LIMITED,
    });
    if (limited) return limited;

    const db = supabaseServer || supabase;
    const { data: existingRequest, error: requestError } = await db
      .from("customer_requests")
      .select("id,brand,phone,deleted_at")
      .eq("id", id)
      .eq("brand", brand)
      .is("deleted_at", null)
      .maybeSingle();

    if (requestError) {
      return jsonError({
        status: 500,
        code: "SLIP_REQUEST_LOOKUP_FAILED",
        message: getReadableError(requestError),
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
        detail: {
          supabaseCode: sanitizeText(requestError.code, 80),
        },
      });
    }

    if (!existingRequest) {
      return jsonError({
        status: 404,
        code: "SLIP_REQUEST_NOT_FOUND",
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    if (sanitizeText(existingRequest.phone, 80) !== phone) {
      return jsonError({
        status: 403,
        code: "SLIP_REQUEST_FORBIDDEN",
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return jsonError({
        status: 400,
        code: "SLIP_FILE_MISSING",
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    diagnostics.fileName = sanitizeText(file.name, 180);
    diagnostics.fileType = sanitizeText(file.type, 120);
    diagnostics.fileSize = Number(file.size || 0);

    logSlipUploadStep("info", "received-file", {
      ...diagnostics,
      durationMs: Date.now() - startedAt,
    });

    if (file.size <= 0) {
      return jsonError({
        status: 400,
        code: "SLIP_EMPTY_FILE",
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    if (file.size > MAX_SLIP_BYTES) {
      return jsonError({
        status: 413,
        code: "SLIP_TOO_LARGE",
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    logSlipUploadStep("info", "buffer-ready", {
      ...diagnostics,
      fileSize: buffer.length,
      durationMs: Date.now() - startedAt,
    });
    const actualMimeType = detectMimeType(buffer);
    diagnostics.detectedFileType = actualMimeType;

    if (!actualMimeType || !ALLOWED_MIME_TYPES.has(actualMimeType)) {
      return jsonError({
        status: 415,
        code: "SLIP_UNSUPPORTED",
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    const originalName = sanitizeText(file.name, 180) || "customer-slip";
    const extension = EXTENSION_BY_MIME[actualMimeType] || "jpg";
    const driveFileName = `customer-slip-${brand}-${id}-${Date.now()}-${randomUUID()}.${extension}`;

    let sharedFile = null;
    try {
      const { drive, parentFolderId } = getDriveContext(brand);
      logSlipUploadStep("info", "drive-upload-start", {
        ...diagnostics,
        durationMs: Date.now() - startedAt,
      });
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
      diagnostics.driveFileId = sanitizeText(uploadedFile.id, 160);

      logSlipUploadStep("info", "drive-upload-success", {
        ...diagnostics,
        durationMs: Date.now() - startedAt,
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

      const { data } = await drive.files.get({
        fileId: uploadedFile.id,
        supportsAllDrives: true,
        fields: "id,name,webViewLink,webContentLink",
      });
      sharedFile = data;
    } catch (storageError) {
      const googleDetail = getGoogleErrorDetail(storageError);
      const code = getStorageErrorCode(storageError);
      if (canUseInlineSlipFallback(code, buffer)) {
        try {
          sharedFile = await uploadSupabaseSlipFallback({
            db,
            buffer,
            brand,
            id,
            mimeType: actualMimeType,
            extension,
            originalName,
          });
          logSlipUploadStep("info", "supabase-fallback-used", {
            ...diagnostics,
            status: 200,
            errorCode: code,
            durationMs: Date.now() - startedAt,
            googleStatus: googleDetail.status,
            googleReason: googleDetail.reason,
            missingEnv: storageError?.missingEnv || [],
          });
        } catch (fallbackError) {
          sharedFile = createInlineSlipFile({
            buffer,
            mimeType: actualMimeType,
            originalName,
          });
          logSlipUploadStep("info", "inline-fallback-used", {
            ...diagnostics,
            status: 200,
            errorCode: code,
            durationMs: Date.now() - startedAt,
            googleStatus: googleDetail.status,
            googleReason: googleDetail.reason,
            missingEnv: storageError?.missingEnv || [],
            supabaseCode: sanitizeText(fallbackError?.code, 80),
            message: sanitizeText(fallbackError?.message || fallbackError, 240),
          });
        }
      } else {
        logSlipUploadStep("error", "failed", {
          ...diagnostics,
          status:
            code === "SLIP_ENV_MISSING"
              ? 500
              : googleDetail.status && googleDetail.status < 500
                ? googleDetail.status
                : 500,
          errorCode: code,
          durationMs: Date.now() - startedAt,
          googleStatus: googleDetail.status,
          googleReason: googleDetail.reason,
          missingEnv: storageError?.missingEnv || [],
          message: googleDetail.message,
        });
        return jsonError({
          status:
            code === "SLIP_ENV_MISSING"
              ? 500
              : googleDetail.status && googleDetail.status < 500
                ? googleDetail.status
                : 500,
          code,
          diagnostics: {
            ...diagnostics,
            durationMs: Date.now() - startedAt,
            googleStatus: googleDetail.status,
            googleReason: googleDetail.reason,
            missingEnv: storageError?.missingEnv || [],
          },
          detail: {
            googleMessage: googleDetail.message,
          },
        });
      }
    }

    const slipUrl =
      actualMimeType === "application/pdf"
        ? sharedFile.webViewLink || sharedFile.webContentLink || ""
        : sharedFile.webContentLink || sharedFile.webViewLink || "";

    const { data: updatedRequest, error: updateError } = await db
      .from("customer_requests")
      .update({
        slip_url: sanitizeText(
          slipUrl,
          sharedFile.storageMode === "inline"
            ? MAX_INLINE_SLIP_URL_LENGTH
            : 1200
        ),
        slip_file_name: originalName,
        slip_file_type: actualMimeType,
      })
      .eq("id", id)
      .eq("brand", brand)
      .is("deleted_at", null)
      .select()
      .single();

    if (updateError) {
      logSlipUploadStep("error", "failed", {
        ...diagnostics,
        status: 500,
        errorCode: "SLIP_ATTACH_ERROR",
        durationMs: Date.now() - startedAt,
        supabaseCode: sanitizeText(updateError.code, 80),
        message: getReadableError(updateError),
      });
      return jsonError({
        status: 500,
        code: "SLIP_ATTACH_ERROR",
        message: getReadableError(updateError),
        diagnostics: {
          ...diagnostics,
          durationMs: Date.now() - startedAt,
        },
        detail: {
          supabaseCode: sanitizeText(updateError.code, 80),
        },
      });
    }

    logSlipUploadStep("info", "database-updated", {
      ...diagnostics,
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    logSlipUpload("info", "Customer slip upload succeeded", {
      ...diagnostics,
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return Response.json({
      success: true,
      code: "SLIP_UPLOAD_OK",
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
    logSlipUpload("error", "Customer slip upload crashed", {
      ...diagnostics,
      status: 500,
      errorCode: "SLIP_UPLOAD_FAILED",
      durationMs: Date.now() - startedAt,
      message: sanitizeText(error?.message || error, 240),
    });

    return Response.json(
      {
        success: false,
        code: "SLIP_UPLOAD_FAILED",
        error: ERROR_MESSAGES.SLIP_UPLOAD_FAILED,
      },
      { status: 500 }
    );
  }
}

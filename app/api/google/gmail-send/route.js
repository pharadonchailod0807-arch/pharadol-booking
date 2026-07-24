import { google } from "googleapis";
import {
  getClientIp,
  normalizeBrand,
  rateLimit,
  rejectCrossSiteRequest,
} from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;

const BRAND_CONFIG = {
  pharadol: {
    clientId: process.env.PHARADOL_GOOGLE_CLIENT_ID,
    clientSecret: process.env.PHARADOL_GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.PHARADOL_GOOGLE_REFRESH_TOKEN,
    senderName: "Pharadol Production",
    senderEmail: "pharadol.production@gmail.com",
  },
  adisorn: {
    clientId: process.env.ADISORN_GOOGLE_CLIENT_ID,
    clientSecret: process.env.ADISORN_GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.ADISORN_GOOGLE_REFRESH_TOKEN,
    senderName: "Adisorn Wedding Studio",
    senderEmail: "adisornweddingstudio@gmail.com",
  },
};

const BRAND_NAMES = {
  pharadol: "Pharadol",
  adisorn: "Adisorn",
};

const GOOGLE_CREDENTIAL_ENV_NAMES = {
  pharadol:
    "PHARADOL_GOOGLE_CLIENT_ID, PHARADOL_GOOGLE_CLIENT_SECRET และ PHARADOL_GOOGLE_REFRESH_TOKEN",
  adisorn:
    "ADISORN_GOOGLE_CLIENT_ID, ADISORN_GOOGLE_CLIENT_SECRET และ ADISORN_GOOGLE_REFRESH_TOKEN",
};

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const MAX_GMAIL_ATTACHMENT_BYTES = 24 * 1024 * 1024;

const normalizeEmail = (value) => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    return String(value.email || value.address || value.value || "").trim();
  }

  return "";
};

const estimateBase64Bytes = (value) =>
  Math.floor((String(value || "").replace(/\s/g, "").length * 3) / 4);

const encodeMimeWord = (value) =>
  `=?UTF-8?B?${Buffer.from(String(value || ""), "utf8").toString("base64")}?=`;

const sanitizeHeaderValue = (value) =>
  String(value || "").replace(/[\r\n]+/g, " ").trim();

const sanitizeFilename = (value) =>
  String(value || "booking.pdf")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[\r\n]+/g, " ")
    .trim() || "booking.pdf";

const wrapBase64 = (value) =>
  String(value || "")
    .match(/.{1,76}/g)
    ?.join("\r\n") || "";

const toBase64Url = (value) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const buildRawMessage = ({
  senderName,
  senderEmail,
  to,
  subject,
  text,
  html,
  attachment,
}) => {
  const boundary = `booking_pdf_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const filename = sanitizeFilename(attachment.filename);
  const safeTo = sanitizeHeaderValue(to);
  const safeSenderEmail = sanitizeHeaderValue(senderEmail);
  const safeSenderName = encodeMimeWord(senderName);
  const safeSubject = encodeMimeWord(subject);
  const bodyContent = String(html || text || "");
  const bodyContentType = html
    ? 'Content-Type: text/html; charset="UTF-8"'
    : 'Content-Type: text/plain; charset="UTF-8"';
  const encodedBody = Buffer.from(bodyContent, "utf8").toString("base64");
  const attachmentContent = String(attachment.content || "").replace(/\s/g, "");

  const message = [
    `From: ${safeSenderName} <${safeSenderEmail}>`,
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    bodyContentType,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(encodedBody),
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    wrapBase64(attachmentContent),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return toBase64Url(message);
};

const getReadableGoogleError = (error, brandId) => {
  const googleErrorData = error?.response?.data || {};
  const rawGoogleError =
    googleErrorData.error_description ||
    googleErrorData.message ||
    googleErrorData.error ||
    error?.message ||
    "ส่งอีเมลผ่าน Gmail ไม่สำเร็จ";
  const googleError =
    typeof rawGoogleError === "string"
      ? rawGoogleError
      : rawGoogleError?.message ||
        rawGoogleError?.error_description ||
        rawGoogleError?.error ||
        (() => {
          try {
            return JSON.stringify(rawGoogleError);
          } catch {
            return "ส่งอีเมลผ่าน Gmail ไม่สำเร็จ";
          }
        })();
  const normalizedGoogleError = String(googleError).toLowerCase();

  if (
    normalizedGoogleError.includes("client secret") ||
    normalizedGoogleError.includes("invalid_client") ||
    normalizedGoogleError.includes("unauthorized_client")
  ) {
    return `Google Client Secret ไม่ถูกต้อง กรุณาตรวจค่า ${GOOGLE_CREDENTIAL_ENV_NAMES[brandId] || GOOGLE_CREDENTIAL_ENV_NAMES.pharadol} ให้ตรงกับ OAuth Client ที่ใช้ขอ refresh token`;
  }

  if (
    normalizedGoogleError.includes("invalid_grant") ||
    normalizedGoogleError.includes("token has been expired") ||
    normalizedGoogleError.includes("revoked")
  ) {
    return "Google refresh token ใช้ไม่ได้หรือหมดอายุ กรุณาเชื่อมต่อ Google ใหม่เพื่อขอ refresh token ชุดใหม่";
  }

  if (
    normalizedGoogleError.includes("api has not been used") ||
    normalizedGoogleError.includes("disabled") ||
    normalizedGoogleError.includes("access not configured") ||
    normalizedGoogleError.includes("gmail api")
  ) {
    return "Gmail API ยังไม่ได้เปิดใช้งาน กรุณาเปิด Gmail API ใน Google Cloud แล้วลองส่งอีกครั้ง";
  }

  if (
    normalizedGoogleError.includes("insufficient") ||
    normalizedGoogleError.includes("permission") ||
    normalizedGoogleError.includes("scope")
  ) {
    return "Google token ยังไม่มีสิทธิ์ส่งอีเมลผ่าน Gmail กรุณาเชื่อมต่อ Google ใหม่เพื่ออนุญาตสิทธิ์ Gmail Compose หรือ Gmail Send";
  }

  return googleError;
};

export async function POST(request) {
  let brandId = "";

  try {
    const blockedCrossSite = rejectCrossSiteRequest(request);
    if (blockedCrossSite) return blockedCrossSite;

    const payload = await request.json().catch(() => null);
    brandId = normalizeBrand(payload?.brandId || payload?.brand);
    const expectedBrandId = normalizeBrand(payload?.expectedBrandId || brandId);
    const config = BRAND_CONFIG[brandId] || null;
    const to = normalizeEmail(payload?.to || payload?.customerEmail || payload?.email);
    const subject = String(payload?.subject || "").trim();
    const text = String(payload?.text || payload?.body || "").trim();
    const html = String(payload?.html || "").trim();
    const attachment = {
      filename: String(payload?.filename || payload?.attachment?.filename || "")
        .trim(),
      content: String(payload?.pdfBase64 || payload?.attachment?.content || "")
        .trim(),
    };

    if (!config) {
      return Response.json(
        { success: false, error: "ไม่พบแบรนด์สำหรับส่งอีเมลผ่าน Gmail" },
        { status: 400 }
      );
    }

    const limited = rateLimit({
      key: `gmail-send:${brandId}:${getClientIp(request)}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: "ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
    });
    if (limited) return limited;

    if (brandId !== expectedBrandId) {
      return Response.json(
        { success: false, error: "แบรนด์ของอีเมลไม่ตรงกับแบรนด์ที่กำลังใช้งาน" },
        { status: 403 }
      );
    }

    const { clientId, clientSecret, refreshToken } = config;

    if (!clientId || !clientSecret || !refreshToken) {
      return Response.json(
        {
          success: false,
          error: `ตั้งค่า Google/Gmail ของ ${BRAND_NAMES[brandId]} ไม่ครบ กรุณาตรวจค่า ${GOOGLE_CREDENTIAL_ENV_NAMES[brandId]}`,
        },
        { status: 500 }
      );
    }

    if (!EMAIL_PATTERN.test(to)) {
      return Response.json(
        { success: false, error: "อีเมลผู้รับไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (!subject || (!text && !html)) {
      return Response.json(
        { success: false, error: "หัวข้อหรือข้อความอีเมลไม่ครบถ้วน" },
        { status: 400 }
      );
    }

    if (!attachment.filename || !attachment.content) {
      return Response.json(
        { success: false, error: "ไม่พบไฟล์ PDF สำหรับแนบอีเมล" },
        { status: 400 }
      );
    }

    if (estimateBase64Bytes(attachment.content) > MAX_GMAIL_ATTACHMENT_BYTES) {
      return Response.json(
        {
          success: false,
          error:
            "ไฟล์แนบมีขนาดใหญ่เกินไปสำหรับ Gmail กรุณาลดขนาดไฟล์หรือส่งลิงก์ดาวน์โหลดแทน",
        },
        { status: 413 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    const raw = buildRawMessage({
      senderName: config.senderName,
      senderEmail: config.senderEmail,
      to,
      subject,
      text,
      html,
      attachment,
    });

    const sentMessage = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
      },
    });

    const messageId = sentMessage.data.id || "";
    const threadId = sentMessage.data.threadId || "";

    return Response.json({
      success: true,
      messageId,
      threadId,
    });
  } catch (error) {
    console.error(
      "Cannot send Gmail message:",
      error?.response?.data?.error || error?.response?.data?.message || error?.message || "unknown error"
    );

    return Response.json(
      {
        success: false,
        error: getReadableGoogleError(error, brandId),
      },
      { status: 500 }
    );
  }
}

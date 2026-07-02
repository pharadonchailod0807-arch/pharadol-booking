import { google } from "googleapis";

export const runtime = "nodejs";
export const maxDuration = 60;

const BRAND_CONFIG = {
  pharadol: {
    clientId:
      process.env.PHARADOL_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret:
      process.env.PHARADOL_GOOGLE_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET,
    refreshToken:
      process.env.PHARADOL_GOOGLE_REFRESH_TOKEN ||
      process.env.GOOGLE_REFRESH_TOKEN,
    senderName: "Pharadol Production",
    senderEmail: "pharadol.production@gmail.com",
  },
  adisorn: {
    clientId: process.env.ADISORN_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret:
      process.env.ADISORN_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    refreshToken:
      process.env.ADISORN_GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN,
    senderName: "Adisorn Wedding Studio",
    senderEmail: "adisornweddingstudio@gmail.com",
  },
};

const BRAND_NAMES = {
  pharadol: "Pharadol",
  adisorn: "Adisorn",
};

const GOOGLE_SECRET_ENV_NAMES = {
  pharadol: "PHARADOL_GOOGLE_CLIENT_SECRET หรือ GOOGLE_CLIENT_SECRET",
  adisorn: "ADISORN_GOOGLE_CLIENT_SECRET หรือ GOOGLE_CLIENT_SECRET",
};

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

const encodeMimeWord = (value) =>
  `=?UTF-8?B?${Buffer.from(String(value || ""), "utf8").toString("base64")}?=`;

const sanitizeHeaderValue = (value) =>
  String(value || "").replace(/[\r\n]+/g, " ").trim();

const sanitizeFilename = (value) =>
  String(value || "booking.pdf")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[\r\n]+/g, " ")
    .trim() || "booking.pdf";

const wrapBase64 = (value) => String(value || "").match(/.{1,76}/g)?.join("\r\n") || "";

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
  body,
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
  const textBody = Buffer.from(String(body || ""), "utf8").toString("base64");
  const attachmentContent = String(attachment.content || "").replace(/\s/g, "");

  const message = [
    `From: ${safeSenderName} <${safeSenderEmail}>`,
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(textBody),
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

export async function POST(request) {
  let requestBrandId = "";

  try {
    const payload = await request.json().catch(() => null);
    const brandId = String(payload?.brandId || "").trim();
    requestBrandId = brandId;
    const expectedBrandId = String(payload?.expectedBrandId || brandId).trim();
    const config = BRAND_CONFIG[brandId] || null;
    const to = String(payload?.to || "").trim();
    const subject = String(payload?.subject || "").trim();
    const body = String(payload?.body || "").trim();
    const attachment = {
      filename: String(payload?.attachment?.filename || "").trim(),
      content: String(payload?.attachment?.content || "").trim(),
    };

    if (!config) {
      return Response.json(
        { success: false, error: "ไม่พบแบรนด์สำหรับสร้าง Gmail Draft" },
        { status: 400 }
      );
    }

    if (brandId !== expectedBrandId) {
      return Response.json(
        { success: false, error: "แบรนด์ของอีเมลไม่ตรงกับแบรนด์ที่กำลังใช้งาน" },
        { status: 403 }
      );
    }

    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      return Response.json(
        {
          success: false,
          error: `ตั้งค่า Google/Gmail ของ ${BRAND_NAMES[brandId]} ไม่ครบ`,
        },
        { status: 500 }
      );
    }

    if (!EMAIL_PATTERN.test(to)) {
      return Response.json(
        { success: false, error: "อีเมลลูกค้าไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (!subject || !body) {
      return Response.json(
        { success: false, error: "หัวข้อหรือเนื้อหาอีเมลไม่ครบถ้วน" },
        { status: 400 }
      );
    }

    if (!attachment.filename || !attachment.content) {
      return Response.json(
        { success: false, error: "ไม่พบไฟล์ PDF สำหรับแนบ Gmail Draft" },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret
    );

    oauth2Client.setCredentials({
      refresh_token: config.refreshToken,
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
      body,
      attachment,
    });

    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
        },
      },
    });

    return Response.json({
      success: true,
      draftId: draft.data.id || "",
      messageId: draft.data.message?.id || "",
      gmailDraftsUrl: "https://mail.google.com/mail/u/0/#drafts",
    });
  } catch (error) {
    const googleErrorData = error?.response?.data || {};
    console.error("Cannot create Gmail draft:", googleErrorData || error);

    const googleError =
      googleErrorData.error_description ||
      googleErrorData.error ||
      error?.message ||
      "สร้าง Gmail Draft ไม่สำเร็จ";
    const normalizedGoogleError = String(googleError).toLowerCase();
    let errorMessage = googleError;

    if (
      normalizedGoogleError.includes("client secret") ||
      normalizedGoogleError.includes("invalid_client") ||
      normalizedGoogleError.includes("unauthorized_client")
    ) {
      const envNames =
        GOOGLE_SECRET_ENV_NAMES[requestBrandId] ||
        "PHARADOL_GOOGLE_CLIENT_SECRET หรือ GOOGLE_CLIENT_SECRET";
      errorMessage = `Google Client Secret ไม่ถูกต้อง กรุณาตรวจค่า ${envNames} ใน .env.local/Vercel ให้เป็น Client secret ของ OAuth Client เดียวกับที่ใช้ขอ refresh token แล้วเชื่อมต่อ Google ใหม่`;
    } else if (
      normalizedGoogleError.includes("invalid_grant") ||
      normalizedGoogleError.includes("token has been expired") ||
      normalizedGoogleError.includes("revoked")
    ) {
      errorMessage =
        "Google refresh token ใช้ไม่ได้หรือหมดอายุ กรุณาเชื่อมต่อ Google ใหม่เพื่อขอ refresh token ชุดใหม่";
    } else if (
      normalizedGoogleError.includes("insufficient") ||
      normalizedGoogleError.includes("permission") ||
      normalizedGoogleError.includes("scope")
    ) {
      errorMessage =
        "Google token ยังไม่มีสิทธิ์ Gmail compose กรุณาเชื่อมต่อ Google ใหม่เพื่ออนุญาตสิทธิ์ Gmail";
    }

    return Response.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

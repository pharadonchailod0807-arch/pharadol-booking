const RESEND_EMAIL_URL = "https://api.resend.com/emails";

export const runtime = "nodejs";
export const maxDuration = 30;

const BRAND_SENDERS = {
  pharadol: {
    name: "Pharadol Production",
    from: process.env.PHARADOL_EMAIL_FROM,
    replyTo:
      process.env.PHARADOL_EMAIL_REPLY_TO ||
      "pharadol.production@gmail.com",
  },
  adisorn: {
    name: "Adisorn Wedding Studio",
    from: process.env.ADISORN_EMAIL_FROM,
    replyTo:
      process.env.ADISORN_EMAIL_REPLY_TO ||
      "adisornweddingstudio@gmail.com",
  },
};

const VALID_BRANDS = new Set(["pharadol", "adisorn"]);
const MAX_RESEND_ATTACHMENT_BYTES = 24 * 1024 * 1024;

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const textToHtml = (text) =>
  `<div style="font-family: Arial, sans-serif; line-height: 1.8; color: #18181b; white-space: normal;">${escapeHtml(
    text
  ).replace(/\n/g, "<br />")}</div>`;

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

const getReadableErrorMessage = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (typeof value?.message === "string") return value.message;
  if (typeof value?.error === "string") return value.error;
  if (typeof value?.name === "string") return value.name;

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
};

const getEmailFromValue = (value) => {
  const emailMatch = String(value || "").match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/);
  return emailMatch?.[0] || "";
};

const formatSenderFrom = (rawFrom, senderName) => {
  const trimmedFrom = String(rawFrom || "").trim();

  if (!trimmedFrom) return "";

  if (/^[^<>]+<[^<>@]+@[^<>@]+\.[^<>@]+>$/.test(trimmedFrom)) {
    return trimmedFrom;
  }

  if (EMAIL_PATTERN.test(trimmedFrom)) {
    return `${senderName} <${trimmedFrom}>`;
  }

  const extractedEmail = getEmailFromValue(trimmedFrom);
  if (extractedEmail) {
    return `${senderName} <${extractedEmail}>`;
  }

  return "";
};

const estimateBase64Bytes = (value) =>
  Math.floor((String(value || "").replace(/\s/g, "").length * 3) / 4);

export async function POST(request) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        error:
          "ยังไม่ได้ตั้งค่า RESEND_API_KEY ใน .env.local จึงยังส่งอีเมลจากระบบไม่ได้",
      },
      { status: 500 }
    );
  }

  const payload = await request.json().catch(() => null);
  const brand = String(payload?.brand || payload?.brandId || "").trim();
  const expectedBrandId = String(payload?.expectedBrandId || brand).trim();
  const sender = BRAND_SENDERS[brand];
  const to = String(payload?.to || "").trim();
  const subject = String(payload?.subject || "").trim();
  const body = String(payload?.body || "").trim();
  const attachments = Array.isArray(payload?.attachments)
    ? payload.attachments
        .map((attachment) => ({
          filename: String(attachment?.filename || "").trim(),
          content: String(attachment?.content || "").trim(),
        }))
        .filter((attachment) => attachment.filename && attachment.content)
    : [];

  if (!VALID_BRANDS.has(brand) || !sender) {
    return Response.json({ error: "ไม่พบแบรนด์สำหรับส่งอีเมล" }, { status: 400 });
  }

  if (brand !== expectedBrandId) {
    return Response.json(
      { error: "แบรนด์ของอีเมลไม่ตรงกับแบรนด์ที่กำลังใช้งาน" },
      { status: 403 }
    );
  }

  if (!sender.from) {
    return Response.json(
      {
        error: `ยังไม่ได้ตั้งค่า ${
          brand === "pharadol" ? "PHARADOL_EMAIL_FROM" : "ADISORN_EMAIL_FROM"
        } ใน .env.local`,
      },
      { status: 500 }
    );
  }

  if (!to || !to.includes("@")) {
    return Response.json(
      { error: "อีเมลลูกค้าไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  if (!subject || !body) {
    return Response.json(
      { error: "หัวข้อหรือเนื้อหาอีเมลไม่ครบถ้วน" },
      { status: 400 }
    );
  }

  const from = formatSenderFrom(sender.from, sender.name);
  if (!from) {
    return Response.json(
      {
        error:
          "รูปแบบอีเมลผู้ส่งไม่ถูกต้อง ให้ตั้งค่าเป็น email@example.com หรือ Name <email@example.com>",
      },
      { status: 500 }
    );
  }

  const attachmentBytes = attachments.reduce(
    (total, attachment) => total + estimateBase64Bytes(attachment.content),
    0
  );

  if (attachmentBytes > MAX_RESEND_ATTACHMENT_BYTES) {
    return Response.json(
      {
        error:
          "ไฟล์แนบมีขนาดใหญ่เกินไปสำหรับส่งอีเมล กรุณาลดขนาดไฟล์หรือส่งลิงก์ดาวน์โหลดแทน",
      },
      { status: 413 }
    );
  }

  let resendResponse;

  try {
    resendResponse = await fetch(RESEND_EMAIL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: body,
        html: textToHtml(body),
        headers: {
          "BIMI-Selector":
            brand === "adisorn"
              ? "v=BIMI1; s=adisorn;"
              : "v=BIMI1; s=pharadol;",
        },
        reply_to: sender.replyTo,
        ...(attachments.length > 0 ? { attachments } : {}),
      }),
    });
  } catch (error) {
    console.error("Resend email network error:", error?.message || "unknown error");

    return Response.json(
      {
        error:
          "เชื่อมต่อระบบส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตหรือ Resend แล้วลองใหม่",
      },
      { status: 502 }
    );
  }

  const result = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    return Response.json(
      {
        error:
          getReadableErrorMessage(
            result?.message || result?.error || result,
            "ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบ Resend API key และ sender domain"
          ),
      },
      { status: resendResponse.status }
    );
  }

  return Response.json({ id: result.id || null, ok: true });
}

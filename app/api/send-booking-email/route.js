const RESEND_EMAIL_URL = "https://api.resend.com/emails";

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
  const brandId = String(payload?.brandId || "").trim();
  const sender = BRAND_SENDERS[brandId];
  const to = String(payload?.to || "").trim();
  const subject = String(payload?.subject || "").trim();
  const body = String(payload?.body || "").trim();

  if (!sender) {
    return Response.json({ error: "ไม่พบแบรนด์สำหรับส่งอีเมล" }, { status: 400 });
  }

  if (!sender.from) {
    return Response.json(
      {
        error: `ยังไม่ได้ตั้งค่า ${
          brandId === "pharadol" ? "PHARADOL_EMAIL_FROM" : "ADISORN_EMAIL_FROM"
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

  const resendResponse = await fetch(RESEND_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${sender.name} <${sender.from}>`,
      to: [to],
      subject,
      text: body,
      html: textToHtml(body),
      reply_to: sender.replyTo,
    }),
  });

  const result = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    return Response.json(
      {
        error:
          result?.message ||
          result?.error ||
          "ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบ Resend API key และ sender domain",
      },
      { status: resendResponse.status }
    );
  }

  return Response.json({ id: result.id || null, ok: true });
}

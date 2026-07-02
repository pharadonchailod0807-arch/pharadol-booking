import { google } from "googleapis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const getGoogleOAuthConfig = (requestUrl) => {
  const envBaseUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(
    /\/$/,
    ""
  );
  const requestBaseUrl = requestUrl
    ? `${requestUrl.protocol}//${requestUrl.host}`
    : "";
  const baseUrl = envBaseUrl || requestBaseUrl;
  const redirectUri =
    baseUrl && `${baseUrl}/api/google/callback`;

  return {
    clientId:
      process.env.PHARADOL_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret:
      process.env.PHARADOL_GOOGLE_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri || process.env.GOOGLE_REDIRECT_URI,
  };
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderHtml = ({ title, message, token }) => {
  const escapedToken = escapeHtml(token);

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        background: #f4f4f5;
        color: #18181b;
        font-family: Arial, sans-serif;
      }
      main {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 24px;
      }
      section {
        width: min(720px, 100%);
        border-radius: 18px;
        background: white;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.12);
        padding: 28px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
      }
      p {
        color: #52525b;
        line-height: 1.7;
      }
      pre {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        border-radius: 14px;
        background: #18181b;
        color: #f8fafc;
        padding: 16px;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        ${token ? `<pre>GOOGLE_REFRESH_TOKEN=${escapedToken}</pre>` : ""}
      </section>
    </main>
  </body>
</html>`;
};

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const { clientId, clientSecret, redirectUri } =
    getGoogleOAuthConfig(requestUrl);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");

  if (error) {
    return new Response(
      renderHtml({
        title: "Google authorization ไม่สำเร็จ",
        message: `Google ส่ง error กลับมา: ${error}`,
      }),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "ตั้งค่า PHARADOL_GOOGLE_CLIENT_ID, PHARADOL_GOOGLE_CLIENT_SECRET หรือ NEXT_PUBLIC_APP_URL ไม่ครบ",
      },
      { status: 500 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "ไม่พบ authorization code จาก Google" },
      { status: 400 }
    );
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    const { tokens } = await oauth2Client.getToken(code);

    return new Response(
      renderHtml({
        title: "เชื่อมต่อ Google สำเร็จ",
        message:
          tokens.refresh_token
            ? "คัดลอกค่า refresh token ด้านล่างไปใส่ใน PHARADOL_GOOGLE_REFRESH_TOKEN หรือ GOOGLE_REFRESH_TOKEN (token นี้รวมสิทธิ์ Google Drive และ Gmail draft)"
            : "Google ไม่ส่ง refresh token กลับมา ถ้าเคยอนุญาตแล้ว ให้ revoke access แล้วลองเข้า /api/google/auth ใหม่",
        token: tokens.refresh_token || "",
      }),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (tokenError) {
    const googleError =
      tokenError?.response?.data?.error || tokenError?.message || "";
    const isInvalidGrant = googleError === "invalid_grant";

    console.error(
      "Cannot exchange Google authorization code:",
      googleError || "unknown error"
    );

    return new Response(
      renderHtml({
        title: "แลก Google token ไม่สำเร็จ",
        message: isInvalidGrant
          ? "authorization code นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาเริ่มใหม่ที่ /api/google/auth"
          : "กรุณาตรวจสอบ GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET และ GOOGLE_REDIRECT_URI แล้วลองใหม่",
      }),
      {
        status: isInvalidGrant ? 400 : 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}

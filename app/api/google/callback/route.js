import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_BRANDS = new Set(["pharadol", "adisorn"]);
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const PRODUCTION_GOOGLE_REDIRECT_URI =
  "https://www.pharadolproduction.com/api/google/callback";
const LOCAL_GOOGLE_REDIRECT_HOSTS = new Set(["localhost", "127.0.0.1"]);
const BRAND_REFRESH_TOKEN_ENV = {
  pharadol: "PHARADOL_GOOGLE_REFRESH_TOKEN",
  adisorn: "ADISORN_GOOGLE_REFRESH_TOKEN",
};
const BRAND_CONFIG = {
  pharadol: {
    clientId: process.env.PHARADOL_GOOGLE_CLIENT_ID,
    clientSecret: process.env.PHARADOL_GOOGLE_CLIENT_SECRET,
  },
  adisorn: {
    clientId: process.env.ADISORN_GOOGLE_CLIENT_ID,
    clientSecret: process.env.ADISORN_GOOGLE_CLIENT_SECRET,
  },
};
const GOOGLE_CREDENTIAL_ENV_NAMES = {
  pharadol:
    "PHARADOL_GOOGLE_CLIENT_ID, PHARADOL_GOOGLE_CLIENT_SECRET และ PHARADOL_GOOGLE_REFRESH_TOKEN",
  adisorn:
    "ADISORN_GOOGLE_CLIENT_ID, ADISORN_GOOGLE_CLIENT_SECRET และ ADISORN_GOOGLE_REFRESH_TOKEN",
};
const BRAND_NAMES = {
  pharadol: "Pharadol",
  adisorn: "Adisorn",
};
const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
};

const isLocalGoogleRedirectHost = (hostname) =>
  LOCAL_GOOGLE_REDIRECT_HOSTS.has(String(hostname || "").toLowerCase());

const isAllowedGoogleRedirectUri = (redirectUri) => {
  if (redirectUri === PRODUCTION_GOOGLE_REDIRECT_URI) return true;

  try {
    const parsedUrl = new URL(redirectUri);
    return (
      isLocalGoogleRedirectHost(parsedUrl.hostname) &&
      parsedUrl.pathname === "/api/google/callback"
    );
  } catch {
    return false;
  }
};

const getGoogleOAuthConfig = (brand, requestUrl) => {
  const envRedirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
  const envBaseUrl = String(process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");
  const requestBaseUrl = requestUrl
    ? `${requestUrl.protocol}//${requestUrl.host}`.replace(/\/$/, "")
    : "";
  const isLocalRequest = requestUrl
    ? isLocalGoogleRedirectHost(requestUrl.hostname)
    : false;
  const baseUrl = envBaseUrl || requestBaseUrl;
  const redirectUri = isLocalRequest
    ? `${requestBaseUrl}/api/google/callback`
    : envRedirectUri || (baseUrl ? `${baseUrl}/api/google/callback` : "");

  const brandConfig = BRAND_CONFIG[brand] || {};

  return {
    clientId: brandConfig.clientId,
    clientSecret: brandConfig.clientSecret,
    redirectUri,
  };
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const tokenHasCalendarScope = async (tokens, oauth2Client) => {
  const scopes = String(tokens?.scope || "").split(/\s+/).filter(Boolean);

  if (scopes.includes(GOOGLE_CALENDAR_SCOPE)) return true;

  if (tokens?.access_token) {
    try {
      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const tokenInfo = await oauth2.tokeninfo({
        access_token: tokens.access_token,
      });
      const tokenInfoScopes = String(tokenInfo.data.scope || "")
        .split(/\s+/)
        .filter(Boolean);

      return tokenInfoScopes.includes(GOOGLE_CALENDAR_SCOPE);
    } catch (scopeError) {
      console.error("Cannot verify Google Calendar scope:", scopeError);
    }
  }

  return false;
};

const renderHtml = ({ title, message, token, envName, brandId, brandName }) => {
  const escapedToken = escapeHtml(token);
  const escapedEnvName = escapeHtml(envName);
  const escapedBrandId = escapeHtml(brandId);
  const escapedBrandName = escapeHtml(brandName);
  const hasToken = Boolean(token);

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        background: linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%);
        color: #0f172a;
        font-family: Arial, sans-serif;
      }
      main {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 24px;
      }
      section {
        width: min(760px, 100%);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 24px;
        background: white;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12);
        padding: 32px;
      }
      h1 {
        margin: 0;
        font-size: clamp(24px, 5vw, 34px);
        line-height: 1.2;
      }
      p {
        color: #475569;
        line-height: 1.7;
      }
      .meta {
        display: grid;
        gap: 10px;
        margin: 22px 0;
        border-radius: 18px;
        background: #f8fafc;
        padding: 18px;
      }
      .meta div {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .label {
        color: #64748b;
        font-weight: 700;
      }
      code,
      textarea {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      }
      code {
        border-radius: 999px;
        background: #e2e8f0;
        color: #0f172a;
        padding: 4px 10px;
        font-weight: 800;
      }
      textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 150px;
        resize: vertical;
        overflow-wrap: anywhere;
        word-break: break-all;
        border: 1px solid rgba(15, 23, 42, 0.14);
        border-radius: 16px;
        background: #0f172a;
        color: #f8fafc;
        padding: 16px;
        font-size: 13px;
        line-height: 1.6;
      }
      button {
        margin-top: 14px;
        min-height: 48px;
        border: 0;
        border-radius: 14px;
        background: #0f3d31;
        color: white;
        cursor: pointer;
        font-size: 15px;
        font-weight: 800;
        padding: 0 18px;
      }
      button:hover {
        filter: brightness(0.96);
      }
      .warning {
        margin-top: 22px;
        border: 1px solid #f59e0b;
        border-radius: 16px;
        background: #fffbeb;
        color: #92400e;
        padding: 14px 16px;
        font-weight: 700;
      }
      .empty {
        border: 1px solid #fecaca;
        border-radius: 16px;
        background: #fef2f2;
        color: #991b1b;
        padding: 14px 16px;
        font-weight: 700;
      }
      .copied {
        margin-left: 10px;
        color: #047857;
        font-size: 14px;
        font-weight: 800;
      }
      @media (max-width: 640px) {
        main {
          padding: 16px;
        }
        section {
          padding: 22px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        <div class="meta">
          <div><span class="label">Brand:</span> <strong>${escapedBrandId || escapedBrandName}</strong></div>
          <div><span class="label">Vercel ENV:</span> <code>${escapedEnvName}</code></div>
        </div>
        ${hasToken
          ? `<label class="label" for="refresh-token">Refresh token ที่ได้รับจาก Google ครั้งนี้</label>
             <textarea id="refresh-token" readonly spellcheck="false">${escapedToken}</textarea>
             <div>
               <button id="copy-token" type="button">คัดลอก Token</button>
               <span id="copy-status" class="copied" aria-live="polite"></span>
             </div>
             <p class="warning">Token นี้เป็นข้อมูลลับ ห้ามส่งให้ผู้อื่น หลังอัปเดตใน Vercel แล้วให้ redeploy</p>`
          : `<p class="empty">ไม่ได้รับ refresh token ใหม่ กรุณาเชื่อม Google ใหม่โดยใช้ prompt=consent และ access_type=offline</p>`}
      </section>
    </main>
    ${hasToken
      ? `<script>
        (function () {
          var button = document.getElementById("copy-token");
          var textarea = document.getElementById("refresh-token");
          var status = document.getElementById("copy-status");
          if (!button || !textarea) return;
          button.addEventListener("click", function () {
            var token = textarea.value;
            var showCopied = function () {
              if (status) status.textContent = "คัดลอกแล้ว";
              window.setTimeout(function () {
                if (status) status.textContent = "";
              }, 1800);
            };
            if (navigator.clipboard && window.isSecureContext) {
              navigator.clipboard.writeText(token).then(showCopied).catch(function () {
                textarea.focus();
                textarea.select();
                document.execCommand("copy");
                showCopied();
              });
              return;
            }
            textarea.focus();
            textarea.select();
            document.execCommand("copy");
            showCopied();
          });
        })();
      </script>`
      : ""}
  </body>
</html>`;
};

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const brand = String(requestUrl.searchParams.get("state") || "").trim();
  const limited = rateLimit({
    key: `google-callback:${brand || "unknown"}:${getClientIp(request)}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
    message: "เชื่อมต่อ Google บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  });
  if (limited) return limited;

  if (error) {
    return new Response(
      renderHtml({
        title: "Google authorization ไม่สำเร็จ",
        message: `Google ส่ง error กลับมา: ${error}`,
        brandId: brand,
        brandName: BRAND_NAMES[brand],
        envName: BRAND_REFRESH_TOKEN_ENV[brand],
      }),
      { status: 400, headers: HTML_HEADERS }
    );
  }

  if (!VALID_BRANDS.has(brand)) {
    return NextResponse.json(
      {
        error:
          "ไม่พบ brand/state จาก Google กรุณาเริ่มใหม่ที่ /api/google/auth?brand=pharadol หรือ /api/google/auth?brand=adisorn",
      },
      { status: 400 }
    );
  }

  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig(
    brand,
    requestUrl
  );

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error: `ตั้งค่า Google OAuth ไม่ครบ กรุณาตรวจค่า ${GOOGLE_CREDENTIAL_ENV_NAMES[brand]} และ GOOGLE_REDIRECT_URI`,
      },
      { status: 500 }
    );
  }

  if (!isAllowedGoogleRedirectUri(redirectUri)) {
    return NextResponse.json(
      {
        error: `GOOGLE_REDIRECT_URI ต้องเป็น ${PRODUCTION_GOOGLE_REDIRECT_URI} หรือ http://localhost:<port>/api/google/callback สำหรับ local dev`,
        currentRedirectUri: redirectUri,
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
    oauth2Client.setCredentials(tokens);

    if (!(await tokenHasCalendarScope(tokens, oauth2Client))) {
      return new Response(
        renderHtml({
          title: "Google Calendar ยังไม่ได้รับอนุญาต",
          message:
            `refresh token ที่ได้ยังไม่มีสิทธิ์ Google Calendar กรุณาเริ่มใหม่ที่ /api/google/auth?brand=${brand} และกดยินยอมสิทธิ์ Google Calendar`,
          brandId: brand,
          brandName: BRAND_NAMES[brand],
          envName: BRAND_REFRESH_TOKEN_ENV[brand],
        }),
        { status: 400, headers: HTML_HEADERS }
      );
    }

    return new Response(
      renderHtml({
        title: `เชื่อมต่อ Google สำเร็จ: ${BRAND_NAMES[brand]}`,
        message:
          tokens.refresh_token
            ? `ได้รับ refresh token ใหม่สำหรับ ${brand} แล้ว ให้นำค่า token ด้านล่างไปใส่ใน Vercel ENV`
            : `ไม่ได้รับ refresh token ใหม่ กรุณาเชื่อม Google ใหม่โดยใช้ prompt=consent และ access_type=offline`,
        token: tokens.refresh_token || "",
        envName: BRAND_REFRESH_TOKEN_ENV[brand],
        brandId: brand,
        brandName: BRAND_NAMES[brand],
      }),
      { headers: HTML_HEADERS }
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
          ? `authorization code นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาเริ่มใหม่ที่ /api/google/auth?brand=${brand}`
          : `กรุณาตรวจสอบ ${GOOGLE_CREDENTIAL_ENV_NAMES[brand]} และ GOOGLE_REDIRECT_URI แล้วลองใหม่`,
        brandId: brand,
        brandName: BRAND_NAMES[brand],
        envName: BRAND_REFRESH_TOKEN_ENV[brand],
      }),
      {
        status: isInvalidGrant ? 400 : 500,
        headers: HTML_HEADERS,
      }
    );
  }
}

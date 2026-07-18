import { google } from "googleapis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar",
];
const GOOGLE_OAUTH_ACCESS_TYPE = "offline";
const GOOGLE_OAUTH_PROMPT = "consent";

const VALID_BRANDS = new Set(["pharadol", "adisorn"]);
const PRODUCTION_GOOGLE_REDIRECT_URI =
  "https://www.pharadolproduction.com/api/google/callback";
const LOCAL_GOOGLE_REDIRECT_HOSTS = new Set(["localhost", "127.0.0.1"]);
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

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const brand = String(requestUrl.searchParams.get("brand") || "").trim();

  if (!VALID_BRANDS.has(brand)) {
    return NextResponse.json(
      {
        error:
          "กรุณาระบุ brand ให้ถูกต้อง เช่น /api/google/auth?brand=pharadol หรือ /api/google/auth?brand=adisorn",
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

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: GOOGLE_OAUTH_ACCESS_TYPE,
    prompt: GOOGLE_OAUTH_PROMPT,
    include_granted_scopes: true,
    scope: GOOGLE_OAUTH_SCOPES,
    state: brand,
  });

  return Response.redirect(authUrl);
}

import { google } from "googleapis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.compose",
];

const VALID_BRANDS = new Set(["pharadol", "adisorn"]);
const EXPECTED_GOOGLE_REDIRECT_URI =
  "https://www.pharadolproduction.com/api/google/callback";

const getGoogleOAuthConfig = (requestUrl) => {
  const envRedirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
  const envBaseUrl = String(process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");
  const requestBaseUrl = requestUrl
    ? `${requestUrl.protocol}//${requestUrl.host}`.replace(/\/$/, "")
    : "";
  const baseUrl = envBaseUrl || requestBaseUrl;
  const redirectUri =
    envRedirectUri || (baseUrl ? `${baseUrl}/api/google/callback` : "");

  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  };
};

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const brand = String(requestUrl.searchParams.get("brand") || "").trim();
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig(
    requestUrl
  );

  if (!VALID_BRANDS.has(brand)) {
    return NextResponse.json(
      {
        error:
          "กรุณาระบุ brand ให้ถูกต้อง เช่น /api/google/auth?brand=pharadol หรือ /api/google/auth?brand=adisorn",
      },
      { status: 400 }
    );
  }

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "ตั้งค่า GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET หรือ GOOGLE_REDIRECT_URI ไม่ครบ",
      },
      { status: 500 }
    );
  }

  if (redirectUri !== EXPECTED_GOOGLE_REDIRECT_URI) {
    return NextResponse.json(
      {
        error: `GOOGLE_REDIRECT_URI ต้องเป็น ${EXPECTED_GOOGLE_REDIRECT_URI}`,
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
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_OAUTH_SCOPES,
    state: brand,
  });

  return Response.redirect(authUrl);
}

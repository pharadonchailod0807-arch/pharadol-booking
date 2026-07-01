import { google } from "googleapis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

const getGoogleOAuthConfig = () => {
  const baseUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(
    /\/$/,
    ""
  );
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

export async function GET() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "ตั้งค่า PHARADOL_GOOGLE_CLIENT_ID, PHARADOL_GOOGLE_CLIENT_SECRET หรือ NEXT_PUBLIC_APP_URL ไม่ครบ",
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
    scope: ["https://www.googleapis.com/auth/drive.file"],
  });

  return Response.redirect(authUrl);
}

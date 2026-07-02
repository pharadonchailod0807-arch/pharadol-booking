import { google } from "googleapis";
import { Readable } from "node:stream";

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
    folderId:
      process.env.PHARADOL_GOOGLE_DRIVE_FOLDER_ID ||
      process.env.GOOGLE_DRIVE_FOLDER_ID,
  },
  adisorn: {
    clientId: process.env.ADISORN_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret:
      process.env.ADISORN_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    refreshToken:
      process.env.ADISORN_GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN,
    folderId:
      process.env.ADISORN_GOOGLE_DRIVE_FOLDER_ID ||
      "1a0BzjxAfwcnVTu7s_xZwkxKYDcPyJK5g",
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

const getFolderIdFromValue = (value) => {
  const folderValue = String(value || "").trim();

  if (!folderValue) return "";

  const folderMatch = folderValue.match(/\/folders\/([^/?#]+)/);

  return folderMatch?.[1] || folderValue;
};

export async function POST(request) {
  let requestBrandId = "";

  try {
    const formData = await request.formData();
    const brandId = String(formData.get("brandId") || "").trim();
    requestBrandId = brandId;
    const expectedBrandId = String(formData.get("expectedBrandId") || brandId).trim();
    const config = BRAND_CONFIG[brandId] || null;

    if (!config) {
      return Response.json(
        { success: false, error: "ไม่พบแบรนด์สำหรับอัปโหลด Google Drive" },
        { status: 400 }
      );
    }

    if (brandId !== expectedBrandId) {
      return Response.json(
        { success: false, error: "แบรนด์ของไฟล์ไม่ตรงกับแบรนด์ที่กำลังใช้งาน" },
        { status: 403 }
      );
    }

    const { clientId, clientSecret, refreshToken } = config;
    const folderId = getFolderIdFromValue(config.folderId);

    if (!clientId || !clientSecret || !refreshToken || !folderId) {
      return Response.json(
        {
          success: false,
          error: `ตั้งค่า Google Drive ของ ${BRAND_NAMES[brandId]} ไม่ครบ`,
        },
        { status: 500 }
      );
    }

    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return Response.json(
        { success: false, error: "ไม่พบไฟล์" },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const drive = google.drive({
      version: "v3",
      auth: oauth2Client,
    });

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await drive.files.create({
      requestBody: {
        name: file.name,
        ...(folderId ? { parents: [folderId] } : {}),
      },
      media: {
        mimeType: file.type || "application/pdf",
        body: Readable.from(buffer),
      },
      fields: "id,name,webViewLink,webContentLink",
    });

    if (!result.data.id) {
      return Response.json(
        { success: false, error: "Google Drive ไม่ส่ง file id กลับมา" },
        { status: 500 }
      );
    }

    await drive.permissions.create({
      fileId: result.data.id,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    const sharedFile = await drive.files.get({
      fileId: result.data.id,
      fields: "id,name,webViewLink,webContentLink",
    });

    return Response.json({
      success: true,
      file: sharedFile.data,
    });
  } catch (error) {
    const googleErrorData = error?.response?.data || {};
    console.error(googleErrorData || error);

    const googleError =
      googleErrorData.error_description ||
      googleErrorData.error ||
      error?.message ||
      "อัปโหลดไม่สำเร็จ";
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
        "Google token ยังไม่มีสิทธิ์ Google Drive กรุณาเชื่อมต่อ Google ใหม่เพื่ออนุญาตสิทธิ์ Drive";
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

import { google } from "googleapis";
import { Readable } from "node:stream";
import {
  getClientIp,
  normalizeBrand,
  rateLimit,
  rejectCrossSiteRequest,
  sanitizeMultilineText,
  sanitizeText,
} from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VALID_BRANDS = new Set([
  "pharadol",
  "adisorn",
]);

const LEGACY_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_LEGACY_BYTES =
  24 * 1024 * 1024;

const MAX_DIRECT_BYTES =
  100 * 1024 * 1024 * 1024;

const BRAND_CONFIG = {
  pharadol: {
    name: "Pharadol",
    clientId:
      process.env.PHARADOL_GOOGLE_CLIENT_ID,
    clientSecret:
      process.env.PHARADOL_GOOGLE_CLIENT_SECRET,
    refreshToken:
      process.env.PHARADOL_GOOGLE_REFRESH_TOKEN,
    folderId:
      process.env.PHARADOL_GOOGLE_DRIVE_FOLDER_ID,
  },
  adisorn: {
    name: "Adisorn",
    clientId:
      process.env.ADISORN_GOOGLE_CLIENT_ID,
    clientSecret:
      process.env.ADISORN_GOOGLE_CLIENT_SECRET,
    refreshToken:
      process.env.ADISORN_GOOGLE_REFRESH_TOKEN,
    folderId:
      process.env.ADISORN_GOOGLE_DRIVE_FOLDER_ID,
  },
};

const getFolderId = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const match = raw.match(
    /\/folders\/([^/?#]+)/
  );

  return match?.[1] || raw;
};

const getDriveContext = (brand) => {
  const config = BRAND_CONFIG[brand];

  if (!config) {
    throw new Error(
      "ไม่พบแบรนด์สำหรับ Google Drive"
    );
  }

  const parentFolderId = getFolderId(
    config.folderId
  );

  if (
    !config.clientId ||
    !config.clientSecret ||
    !config.refreshToken ||
    !parentFolderId
  ) {
    throw new Error(
      `ตั้งค่า Google Drive ของ ${config.name} ไม่ครบ`
    );
  }

  const auth = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret
  );

  auth.setCredentials({
    refresh_token:
      config.refreshToken,
  });

  return {
    auth,
    drive: google.drive({
      version: "v3",
      auth,
    }),
    parentFolderId,
  };
};

const verifyChildFolder = async ({
  drive,
  folderId,
  parentFolderId,
}) => {
  const { data } =
    await drive.files.get({
      fileId: folderId,
      supportsAllDrives: true,
      fields:
        "id,mimeType,parents,trashed",
    });

  const isFolder =
    data.mimeType ===
    "application/vnd.google-apps.folder";

  const isChild =
    Array.isArray(data.parents) &&
    data.parents.includes(
      parentFolderId
    );

  if (
    !isFolder ||
    !isChild ||
    data.trashed
  ) {
    throw new Error(
      "โฟลเดอร์นี้ไม่อยู่ในพื้นที่ส่งงานของแบรนด์"
    );
  }
};

const createFolder = async ({
  drive,
  parentFolderId,
  folderName,
  description,
}) => {
  const { data } =
    await drive.files.create({
      supportsAllDrives: true,
      fields:
        "id,name,webViewLink",
      requestBody: {
        name: folderName,
        mimeType:
          "application/vnd.google-apps.folder",
        parents: [parentFolderId],
        description:
          description || undefined,
      },
    });

  return data;
};

const createUploadSession = async ({
  auth,
  folderId,
  fileName,
  mimeType,
  size,
}) => {
  const tokenResult =
    await auth.getAccessToken();

  const accessToken =
    typeof tokenResult === "string"
      ? tokenResult
      : tokenResult?.token;

  if (!accessToken) {
    throw new Error(
      "ไม่สามารถขอ Google access token ได้"
    );
  }

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
        "Content-Type":
          "application/json; charset=UTF-8",
        "X-Upload-Content-Type":
          mimeType ||
          "application/octet-stream",
        "X-Upload-Content-Length":
          String(size),
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
      }),
    }
  );

  if (!response.ok) {
    const detail =
      await response.text();

    throw new Error(
      detail ||
        "สร้างช่องทางอัปโหลด Google Drive ไม่สำเร็จ"
    );
  }

  const uploadUrl =
    response.headers.get("location");

  if (!uploadUrl) {
    throw new Error(
      "Google Drive ไม่ส่ง Upload URL กลับมา"
    );
  }

  return uploadUrl;
};

const shareFolder = async ({
  drive,
  folderId,
}) => {
  await drive.permissions.create({
    fileId: folderId,
    supportsAllDrives: true,
    sendNotificationEmail: false,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  const { data } =
    await drive.files.get({
      fileId: folderId,
      supportsAllDrives: true,
      fields:
        "id,name,webViewLink",
    });

  return data;
};

const handleJsonAction = async (
  request,
  payload
) => {
  const brand = normalizeBrand(
    payload?.brand
  );

  if (!VALID_BRANDS.has(brand)) {
    return Response.json(
      {
        success: false,
        error: "ไม่พบแบรนด์",
      },
      {
        status: 400,
      }
    );
  }

  const limited = rateLimit({
    key:
      `google-delivery:${brand}:` +
      getClientIp(request),
    limit: 120,
    windowMs:
      10 * 60 * 1000,
    message:
      "ทำรายการบ่อยเกินไป กรุณารอสักครู่",
  });

  if (limited) return limited;

  const action = sanitizeText(
    payload?.action,
    80
  );

  const {
    auth,
    drive,
    parentFolderId,
  } = getDriveContext(brand);

  if (action === "create-folder") {
    const folderName = sanitizeText(
      payload?.folderName,
      240
    );

    const description =
      sanitizeMultilineText(
        payload?.description,
        3000
      );

    if (!folderName) {
      return Response.json(
        {
          success: false,
          error:
            "กรุณาระบุชื่อโฟลเดอร์",
        },
        {
          status: 400,
        }
      );
    }

    const folder =
      await createFolder({
        drive,
        parentFolderId,
        folderName,
        description,
      });

    return Response.json({
      success: true,
      folder,
    });
  }

  if (
    action ===
    "create-upload-session"
  ) {
    const folderId = sanitizeText(
      payload?.folderId,
      240
    );

    const fileName = sanitizeText(
      payload?.fileName,
      500
    );

    const mimeType = sanitizeText(
      payload?.mimeType,
      240
    );

    const size = Number(
      payload?.size || 0
    );

    const safeType =
      mimeType.startsWith("image/") ||
      mimeType.startsWith("video/");

    if (
      !folderId ||
      !fileName ||
      !safeType ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > MAX_DIRECT_BYTES
    ) {
      return Response.json(
        {
          success: false,
          error:
            "ข้อมูลไฟล์ไม่ถูกต้อง",
        },
        {
          status: 400,
        }
      );
    }

    await verifyChildFolder({
      drive,
      folderId,
      parentFolderId,
    });

    const uploadUrl =
      await createUploadSession({
        auth,
        folderId,
        fileName,
        mimeType,
        size,
      });

    return Response.json({
      success: true,
      uploadUrl,
    });
  }

  if (
    action === "share-folder"
  ) {
    const folderId = sanitizeText(
      payload?.folderId,
      240
    );

    if (!folderId) {
      return Response.json(
        {
          success: false,
          error:
            "ไม่พบโฟลเดอร์ส่งงาน",
        },
        {
          status: 400,
        }
      );
    }

    await verifyChildFolder({
      drive,
      folderId,
      parentFolderId,
    });

    const folder =
      await shareFolder({
        drive,
        folderId,
      });

    return Response.json({
      success: true,
      folder,
    });
  }

  return Response.json(
    {
      success: false,
      error:
        "ไม่รองรับคำสั่งนี้",
    },
    {
      status: 400,
    }
  );
};

const handleLegacyUpload = async (
  request
) => {
  const formData =
    await request.formData();

  const brand = normalizeBrand(
    formData.get("brandId") ||
      formData.get("brand")
  );

  const expectedBrand =
    normalizeBrand(
      formData.get(
        "expectedBrandId"
      ) || brand
    );

  if (
    !VALID_BRANDS.has(brand) ||
    brand !== expectedBrand
  ) {
    return Response.json(
      {
        success: false,
        error:
          "แบรนด์ของไฟล์ไม่ถูกต้อง",
      },
      {
        status: 400,
      }
    );
  }

  const file =
    formData.get("file");

  if (
    !file ||
    typeof file === "string"
  ) {
    return Response.json(
      {
        success: false,
        error: "ไม่พบไฟล์",
      },
      {
        status: 400,
      }
    );
  }

  if (
    !LEGACY_FILE_TYPES.has(
      file.type || ""
    )
  ) {
    return Response.json(
      {
        success: false,
        error:
          "รองรับเฉพาะ PDF, JPG, PNG และ WEBP",
      },
      {
        status: 400,
      }
    );
  }

  if (
    file.size >
    MAX_LEGACY_BYTES
  ) {
    return Response.json(
      {
        success: false,
        error:
          "ไฟล์มีขนาดใหญ่เกิน 24MB",
      },
      {
        status: 413,
      }
    );
  }

  const {
    drive,
    parentFolderId,
  } = getDriveContext(brand);

  const buffer = Buffer.from(
    await file.arrayBuffer()
  );

  const { data } =
    await drive.files.create({
      supportsAllDrives: true,
      fields:
        "id,name,webViewLink,webContentLink",
      requestBody: {
        name:
          sanitizeText(
            file.name,
            500
          ) || "upload",
        parents: [
          parentFolderId,
        ],
      },
      media: {
        mimeType:
          file.type ||
          "application/octet-stream",
        body:
          Readable.from(buffer),
      },
    });

  await drive.permissions.create({
    fileId: data.id,
    supportsAllDrives: true,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  const sharedFile =
    await drive.files.get({
      fileId: data.id,
      supportsAllDrives: true,
      fields:
        "id,name,webViewLink,webContentLink",
    });

  return Response.json({
    success: true,
    driveFileId:
      sharedFile.data.id || "",
    driveViewUrl:
      sharedFile.data
        .webViewLink || "",
    driveDownloadUrl:
      sharedFile.data
        .webContentLink || "",
    file: sharedFile.data,
  });
};

export async function POST(
  request
) {
  const blockedCrossSite =
    rejectCrossSiteRequest(request);

  if (blockedCrossSite) {
    return blockedCrossSite;
  }

  try {
    const contentType =
      request.headers.get(
        "content-type"
      ) || "";

    if (
      contentType.includes(
        "multipart/form-data"
      )
    ) {
      return await handleLegacyUpload(
        request
      );
    }

    const payload =
      await request
        .json()
        .catch(() => null);

    return await handleJsonAction(
      request,
      payload
    );
  } catch (error) {
    const detail =
      error?.response?.data
        ?.error_description ||
      error?.response?.data
        ?.error ||
      error?.message ||
      "อัปโหลด Google Drive ไม่สำเร็จ";

    console.error(
      "Google Drive upload error",
      detail
    );

    return Response.json(
      {
        success: false,
        error: String(detail),
      },
      {
        status: 500,
      }
    );
  }
}

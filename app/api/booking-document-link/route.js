import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getEnv = (...names) =>
  names
    .map((name) => process.env[name])
    .find((value) => String(value || "").trim()) || "";

const getGoogleAccessToken = async (prefix) => {
  const clientId = getEnv(
    `${prefix}_GOOGLE_CLIENT_ID`,
    "GOOGLE_CLIENT_ID"
  );
  const clientSecret = getEnv(
    `${prefix}_GOOGLE_CLIENT_SECRET`,
    "GOOGLE_CLIENT_SECRET"
  );
  const refreshToken = getEnv(
    `${prefix}_GOOGLE_REFRESH_TOKEN`,
    "GOOGLE_REFRESH_TOKEN"
  );

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      `ยังตั้งค่า Google OAuth ของ ${prefix} ไม่ครบ`
    );
  }

  const tokenResponse = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    }
  );

  const tokenResult = await tokenResponse
    .json()
    .catch(() => ({}));

  if (!tokenResponse.ok || !tokenResult.access_token) {
    throw new Error(
      tokenResult.error_description ||
        tokenResult.error ||
        "ไม่สามารถเชื่อมต่อ Google Drive ได้"
    );
  }

  return tokenResult.access_token;
};

const sanitizeFileName = (value) =>
  String(value || "booking")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const requestedBrand = String(
      formData.get("brand") || ""
    ).toLowerCase();

    const brand =
      requestedBrand === "adisorn"
        ? "adisorn"
        : "pharadol";

    if (
      !file ||
      typeof file === "string" ||
      typeof file.arrayBuffer !== "function"
    ) {
      return NextResponse.json(
        { error: "ไม่พบไฟล์ PDF" },
        { status: 400 }
      );
    }

    const prefix = brand.toUpperCase();
    const bookingNumber = sanitizeFileName(
      formData.get("bookingNumber")
    );
    const accessToken =
      await getGoogleAccessToken(prefix);

    const folderId = getEnv(
      `${prefix}_GOOGLE_DRIVE_FOLDER_ID`,
      `${prefix}_DRIVE_FOLDER_ID`,
      `${prefix}_GOOGLE_FOLDER_ID`,
      `${prefix}_GOOGLE_DRIVE_UPLOAD_FOLDER_ID`
    );

    const fileName =
      sanitizeFileName(
        file.name ||
          `${bookingNumber || "booking"}-booking.pdf`
      ) || "booking.pdf";

    const metadata = {
      name: fileName.endsWith(".pdf")
        ? fileName
        : `${fileName}.pdf`,
      mimeType: "application/pdf",
      ...(folderId ? { parents: [folderId] } : {}),
    };

    const boundary = `booking-${crypto.randomUUID()}`;

    const uploadBody = new Blob(
      [
        `--${boundary}\r\n` +
          "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
          `${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\n` +
          "Content-Type: application/pdf\r\n\r\n",
        await file.arrayBuffer(),
        `\r\n--${boundary}--`,
      ],
      {
        type: `multipart/related; boundary=${boundary}`,
      }
    );

    const uploadResponse = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files" +
        "?uploadType=multipart" +
        "&supportsAllDrives=true" +
        "&fields=id,name,webViewLink,webContentLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type":
            `multipart/related; boundary=${boundary}`,
        },
        body: uploadBody,
        cache: "no-store",
      }
    );

    const uploadResult = await uploadResponse
      .json()
      .catch(() => ({}));

    if (!uploadResponse.ok || !uploadResult.id) {
      throw new Error(
        uploadResult.error?.message ||
          "อัปโหลดไฟล์ไป Google Drive ไม่สำเร็จ"
      );
    }

    const permissionResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/` +
        `${uploadResult.id}/permissions` +
        "?supportsAllDrives=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
        cache: "no-store",
      }
    );

    if (!permissionResponse.ok) {
      const permissionResult = await permissionResponse
        .json()
        .catch(() => ({}));

      throw new Error(
        permissionResult.error?.message ||
          "ไม่สามารถเปิดสิทธิ์ลิงก์เอกสารได้"
      );
    }

    const url =
      uploadResult.webViewLink ||
      `https://drive.google.com/file/d/` +
        `${uploadResult.id}/view`;

    return NextResponse.json({
      success: true,
      brand,
      fileId: uploadResult.id,
      url,
    });
  } catch (error) {
    console.error(
      "Booking document link upload error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "ไม่สามารถสร้างลิงก์เอกสารได้",
      },
      { status: 500 }
    );
  }
}

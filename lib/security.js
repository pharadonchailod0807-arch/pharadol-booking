const VALID_BRANDS = new Set(["pharadol", "adisorn"]);
const rateLimitStore = globalThis.__bookingRateLimitStore || new Map();

globalThis.__bookingRateLimitStore = rateLimitStore;

export const isValidBrand = (brand) => VALID_BRANDS.has(String(brand || "").trim());

export const normalizeBrand = (brand) => {
  const normalized = String(brand || "").trim().toLowerCase();
  return isValidBrand(normalized) ? normalized : "";
};

export const sanitizeText = (value, maxLength = 1000) =>
  String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

export const sanitizeMultilineText = (value, maxLength = 3000) =>
  String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLength);

export const getClientIp = (request) =>
  String(
    request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown"
  )
    .split(",")[0]
    .trim() || "unknown";

export const isSameOriginRequest = (request) => {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
    return false;
  }

  if (origin) {
    return origin === requestUrl.origin;
  }

  if (referer) {
    try {
      return new URL(referer).origin === requestUrl.origin;
    } catch {
      return false;
    }
  }

  return true;
};

export const rejectCrossSiteRequest = (request) => {
  if (isSameOriginRequest(request)) return null;

  return Response.json(
    { success: false, error: "ไม่อนุญาตให้เรียก API จากเว็บไซต์อื่น" },
    { status: 403 }
  );
};

export const rejectDocumentNavigation = (request) => {
  const mode = request.headers.get("sec-fetch-mode");
  const accept = request.headers.get("accept") || "";

  if (mode === "navigate" || accept.includes("text/html")) {
    return Response.json(
      { success: false, error: "ไม่อนุญาตให้เปิดข้อมูลนี้โดยตรง" },
      { status: 403 }
    );
  }

  return null;
};

export const rateLimit = ({
  key,
  limit = 30,
  windowMs = 60_000,
  message = "มีการเรียกใช้งานบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
}) => {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (record.count >= limit) {
    return Response.json(
      { success: false, error: message },
      { status: 429 }
    );
  }

  record.count += 1;
  rateLimitStore.set(key, record);
  return null;
};

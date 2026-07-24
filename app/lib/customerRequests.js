"use client";

export const CUSTOMER_REQUEST_STATUSES = {
  new: "ใหม่",
  viewed: "เปิดดูแล้ว",
  contacted: "ติดต่อแล้ว",
  converted: "สร้างใบจองแล้ว",
  created_booking: "สร้างใบจองแล้ว",
};

export const CUSTOMER_FORM_LINKS = {
  pharadol: "https://www.pharadolproduction.com/form/pharadol",
  adisorn: "https://www.pharadolproduction.com/form/adisorn",
};

export const CUSTOMER_REQUESTS_EVENT = "customer-requests-updated";
export const CUSTOMER_REQUESTS_CACHE_TTL_MS = 15 * 60 * 1000;

export const getCustomerRequestsStorageKey = (brand) =>
  `${brand}_customer_requests`;

export const getCustomerRequestsCacheKey = (brand) =>
  `${brand}_customer_requests_cache_meta`;

export const getPendingBookingPrefillKey = (brand) =>
  `pendingBookingPrefill_${brand}`;

const normalizeDateValue = (value) => {
  const normalizedValue = normalizeTextValue(value);
  if (!normalizedValue) return "";
  return normalizedValue.slice(0, 10);
};

export const normalizeTextValue = (value) => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (value && typeof value === "object") {
    return String(
      value.email ||
        value.address ||
        value.value ||
        value.text ||
        value.name ||
        value.url ||
        value.webViewLink ||
        value.webContentLink ||
        ""
    ).trim();
  }

  return "";
};

export const normalizeEmail = (value) => normalizeTextValue(value);

const getFirstValue = (...values) =>
  values.map(normalizeTextValue).find(Boolean) || "";

export const normalizeCustomerRequest = (request) => ({
  id: normalizeTextValue(request?.id),
  brand: normalizeTextValue(request?.brand),
  customerName: getFirstValue(
    request?.customerName,
    request?.customer_name,
    request?.name
  ),
  phone: getFirstValue(request?.phone, request?.customerPhone, request?.customer_phone),
  email: normalizeEmail(
    getFirstValue(request?.customerEmail, request?.customer_email, request?.email)
  ),
  eventLocation: getFirstValue(
    request?.eventLocation,
    request?.event_location,
    request?.location,
    request?.venue
  ),
  eventDate: normalizeDateValue(request?.eventDate || request?.event_date || request?.date),
  note: normalizeTextValue(request?.note || request?.detail),
  slipUrl: getFirstValue(
    request?.slipImage,
    request?.slip_image,
    request?.slipUrl,
    request?.slip_url,
    request?.slipFile,
    request?.slip_file,
    request?.paymentSlip,
    request?.payment_slip,
    request?.paymentSlipUrl,
    request?.payment_slip_url,
    request?.paymentProofUrl,
    request?.payment_proof_url,
    request?.proofImageUrl,
    request?.proof_image_url
  ),
  slipFileName: getFirstValue(
    request?.slipFileName,
    request?.slip_file_name,
    request?.paymentSlipFileName,
    request?.payment_slip_file_name,
    request?.paymentProofFileName,
    request?.payment_proof_file_name,
    request?.proofImageFileName,
    request?.proof_image_file_name
  ),
  slipFileType: getFirstValue(
    request?.slipFileType,
    request?.slip_file_type,
    request?.paymentSlipFileType,
    request?.payment_slip_file_type,
    request?.paymentProofFileType,
    request?.payment_proof_file_type,
    request?.proofImageFileType,
    request?.proof_image_file_type
  ),
  status: normalizeTextValue(request?.status) || "new",
  source: normalizeTextValue(request?.source) || "customer_form",
  createdAt:
    normalizeTextValue(request?.createdAt || request?.created_at) ||
    new Date().toISOString(),
  bookingId: normalizeTextValue(request?.bookingId || request?.booking_id),
  deletedAt: normalizeTextValue(request?.deletedAt || request?.deleted_at),
});

export const readLocalCustomerRequests = (brand) => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(getCustomerRequestsStorageKey(brand)) || "[]"
    );
    return Array.isArray(parsed)
      ? parsed.map(normalizeCustomerRequest).filter((item) => item.brand === brand)
      : [];
  } catch {
    return [];
  }
};

const readCustomerRequestsCacheTime = (brand) => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(getCustomerRequestsCacheKey(brand)) || "null"
    );
    return Number(parsed?.syncedAt || 0);
  } catch {
    return 0;
  }
};

const writeCustomerRequestsCacheTime = (brand) => {
  localStorage.setItem(
    getCustomerRequestsCacheKey(brand),
    JSON.stringify({ syncedAt: Date.now() })
  );
};

export const writeLocalCustomerRequests = (
  brand,
  requests,
  { notify = true, markSynced = false } = {}
) => {
  localStorage.setItem(
    getCustomerRequestsStorageKey(brand),
    JSON.stringify(requests.map(normalizeCustomerRequest))
  );
  if (markSynced) writeCustomerRequestsCacheTime(brand);
  if (notify) window.dispatchEvent(new Event(CUSTOMER_REQUESTS_EVENT));
};

export const fetchCustomerRequests = async (
  brand,
  { signal, cache = "default" } = {}
) => {
  const response = await fetch(`/api/customer-requests?brand=${brand}`, {
    cache,
    signal,
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new Error(result.error || "โหลดคำขอจากลูกค้าไม่สำเร็จ");
  }

  return Array.isArray(result.requests)
    ? result.requests.map(normalizeCustomerRequest)
    : [];
};

export const loadCustomerRequests = async (
  brand,
  { forceRemote = false, maxAgeMs = CUSTOMER_REQUESTS_CACHE_TTL_MS, signal } = {}
) => {
  const localRequests = readLocalCustomerRequests(brand);
  const lastSyncedAt = readCustomerRequestsCacheTime(brand);
  const cacheAge = Date.now() - lastSyncedAt;

  if (!forceRemote && lastSyncedAt > 0 && cacheAge < maxAgeMs) {
    return { requests: localRequests, source: "local-cache" };
  }

  try {
    const remoteRequests = await fetchCustomerRequests(brand, {
      cache: forceRemote ? "reload" : "default",
      signal,
    });
    writeLocalCustomerRequests(brand, remoteRequests, {
      markSynced: true,
      notify: false,
    });
    return { requests: remoteRequests, source: "remote" };
  } catch (error) {
    return { requests: localRequests, source: "local", error };
  }
};

export const countNewCustomerRequests = (requests) =>
  requests.filter(
    (request) => request.status === "new" && !request.deletedAt
  ).length;

export const updateLocalCustomerRequest = (brand, id, updates) => {
  const nextRequests = readLocalCustomerRequests(brand).map((request) =>
    request.id === id ? normalizeCustomerRequest({ ...request, ...updates }) : request
  );
  writeLocalCustomerRequests(brand, nextRequests);
  return nextRequests;
};

export const deleteLocalCustomerRequest = (brand, id) => {
  const nextRequests = readLocalCustomerRequests(brand).filter(
    (request) => request.id !== id
  );
  writeLocalCustomerRequests(brand, nextRequests);
  return nextRequests;
};

export const getCustomerRequestPrefill = (request, fallbackBrand = "") => {
  const normalizedRequest = normalizeCustomerRequest({
    ...request,
    brand: request?.brand || fallbackBrand,
  });

  return {
    requestId: normalizedRequest.id,
    sourceRequestId: normalizedRequest.id,
    brand: normalizedRequest.brand || fallbackBrand,
    customerName: normalizedRequest.customerName,
    customerEmail: normalizedRequest.email,
    customerPhone: normalizedRequest.phone,
    phone: normalizedRequest.phone,
    email: normalizedRequest.email,
    location: normalizedRequest.eventLocation,
    eventLocation: normalizedRequest.eventLocation,
    eventDate: normalizedRequest.eventDate,
    note: normalizedRequest.note,
    paymentNote: normalizedRequest.note,
    slipImage: normalizedRequest.slipUrl,
    slipFileName: normalizedRequest.slipFileName,
    slipFileType: normalizedRequest.slipFileType,
  };
};

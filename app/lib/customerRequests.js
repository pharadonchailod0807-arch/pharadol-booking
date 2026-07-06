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

export const getCustomerRequestsStorageKey = (brand) =>
  `${brand}_customer_requests`;

export const getPendingBookingPrefillKey = (brand) =>
  `pendingBookingPrefill_${brand}`;

const normalizeDateValue = (value) => {
  if (!value) return "";
  return String(value).slice(0, 10);
};

export const normalizeCustomerRequest = (request) => ({
  id: request?.id || "",
  brand: request?.brand || "",
  customerName: request?.customerName || request?.customer_name || "",
  phone: request?.phone || "",
  email: request?.email || "",
  eventLocation: request?.eventLocation || request?.event_location || "",
  eventDate: normalizeDateValue(request?.eventDate || request?.event_date),
  note: request?.note || request?.detail || "",
  slipUrl: request?.slipUrl || request?.slip_url || "",
  slipFileName: request?.slipFileName || request?.slip_file_name || "",
  slipFileType: request?.slipFileType || request?.slip_file_type || "",
  status: request?.status || "new",
  source: request?.source || "customer_form",
  createdAt: request?.createdAt || request?.created_at || new Date().toISOString(),
  bookingId: request?.bookingId || request?.booking_id || "",
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

export const writeLocalCustomerRequests = (brand, requests) => {
  localStorage.setItem(
    getCustomerRequestsStorageKey(brand),
    JSON.stringify(requests.map(normalizeCustomerRequest))
  );
  window.dispatchEvent(new Event(CUSTOMER_REQUESTS_EVENT));
};

export const fetchCustomerRequests = async (brand) => {
  const response = await fetch(`/api/customer-requests?brand=${brand}`, {
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new Error(result.error || "โหลดคำขอจากลูกค้าไม่สำเร็จ");
  }

  return Array.isArray(result.requests)
    ? result.requests.map(normalizeCustomerRequest)
    : [];
};

export const loadCustomerRequests = async (brand) => {
  const localRequests = readLocalCustomerRequests(brand);

  try {
    const remoteRequests = await fetchCustomerRequests(brand);
    writeLocalCustomerRequests(brand, remoteRequests);
    return { requests: remoteRequests, source: "remote" };
  } catch (error) {
    return { requests: localRequests, source: "local", error };
  }
};

export const countNewCustomerRequests = (requests) =>
  requests.filter((request) => request.status === "new").length;

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

export const getCustomerRequestPrefill = (request) => ({
  requestId: request.id,
  brand: request.brand,
  customerName: request.customerName,
  phone: request.phone,
  email: request.email,
  location: request.eventLocation,
  eventDate: request.eventDate,
  paymentNote: request.note,
});

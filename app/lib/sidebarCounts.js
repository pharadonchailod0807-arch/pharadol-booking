import {
  calculateDashboardCounts,
  emptyDashboardCounts,
} from "@/app/lib/dashboardCounts";
import { readLocalCustomerRequests } from "@/app/lib/customerRequests";
import { safeGetArray } from "@/app/lib/safeStorage";

export const SIDEBAR_COUNTS_EVENT = "booking-data-updated";

export const emptySidebarCounts = {
  ...emptyDashboardCounts,
  calendarJobs: 0,
  customerRequests: 0,
  membersCount: 0,
  notificationsCount: 0,
  reportsCount: 0,
};

const BRAND_IDS = ["pharadol", "adisorn"];
const ACTIVE_CUSTOMER_REQUEST_STATUSES = new Set([
  "new",
  "pending",
  "viewed",
  "uncontacted",
  "not_contacted",
  "ยังไม่ติดต่อ",
  "ใหม่",
]);
const READ_NOTIFICATION_STATUSES = new Set([
  "read",
  "seen",
  "done",
  "completed",
  "closed",
  "อ่านแล้ว",
]);

const safeReadArray = (key) => {
  if (typeof window === "undefined") return [];
  return safeGetArray(key);
};

const safeGetItem = (key) => {
  if (typeof window === "undefined") return "";

  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const belongsToBrand = (item, brandId) => {
  const itemBrand = String(item?.brandId || item?.brand || "").trim();
  return itemBrand === brandId;
};

const isDeletedRecord = (item) => {
  const statusText = [
    item?.deleted,
    item?.isDeleted,
    item?.deletedAt,
    item?.deletedDate,
    item?.deletedFrom,
    item?.status,
    item?.jobStatus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    item?.deleted === true ||
    item?.isDeleted === true ||
    statusText.includes("trash") ||
    statusText.includes("deleted") ||
    statusText.includes("ถังขยะ")
  );
};

const getRecordIdentity = (item, index, scope) => {
  const identity =
    item?.bookingNumber ||
    item?.booking_number ||
    item?.supabaseId ||
    item?.id ||
    item?.receiptNumber ||
    item?.emailId ||
    item?.messageId;

  return identity ? `${scope}:${identity}` : `${scope}:index-${index}`;
};

const dedupeRecords = (items, brandId, scope) => {
  const seen = new Set();

  return items.filter((item, index) => {
    if (!item || !belongsToBrand(item, brandId)) return false;

    const identity = getRecordIdentity(item, index, scope);
    if (seen.has(identity)) return false;

    seen.add(identity);
    return true;
  });
};

export const countActiveCustomerRequests = (brandId) =>
  readLocalCustomerRequests(brandId).filter((request) => {
    const status = String(request?.status || "new").trim().toLowerCase();
    return ACTIVE_CUSTOMER_REQUEST_STATUSES.has(status);
  }).length;

const countUnreadNotifications = (brandId) =>
  safeReadArray(`${brandId}_notifications`).filter((notification) => {
    if (!belongsToBrand(notification, brandId)) return false;
    if (notification?.read === true || notification?.isRead === true) return false;

    const status = String(notification?.status || "").trim().toLowerCase();
    return !READ_NOTIFICATION_STATUSES.has(status);
  }).length;

export const getBrandSidebarCounts = (brandId) => {
  const customers = dedupeRecords(
    safeReadArray(`${brandId}_customers`).filter((item) => !isDeletedRecord(item)),
    brandId,
    "customers"
  );
  const archiveItems = dedupeRecords(
    safeReadArray(`${brandId}_archives`),
    brandId,
    "archives"
  );
  const trashItems = dedupeRecords(
    safeReadArray(`${brandId}_trash`),
    brandId,
    "trash"
  );
  const mailTrashItems = dedupeRecords(
    safeReadArray(`${brandId}_mail_trash`),
    brandId,
    "mail-trash"
  );
  const emailHistory = dedupeRecords(
    safeReadArray(`${brandId}_email_history`),
    brandId,
    "email-history"
  );
  const hasBookingDraft = Boolean(safeGetItem(`${brandId}_bookingDraft`));
  const baseCounts = calculateDashboardCounts({
    brandId,
    customers,
    archiveItems,
    trashItems,
    emailHistory,
    hasBookingDraft,
  });
  const notificationsCount = countUnreadNotifications(brandId);

  return {
    ...baseCounts,
    trashItems: trashItems.length + mailTrashItems.length,
    calendarJobs: customers.filter((customer) => customer?.eventDate).length,
    customerRequests: countActiveCustomerRequests(brandId),
    notificationsCount:
      notificationsCount > 0 ? notificationsCount : baseCounts.upcoming7Days,
    reportsCount: 0,
  };
};

export const getRemoteBrandSidebarCounts = async (brandId) => {
  const [bookingResult, memberResult] = await Promise.allSettled([
    fetch(`/api/bookings?mode=counts&brand=${brandId}`, {
      cache: "no-store",
    }),
    fetch(`/api/members?stats=1&brand=${brandId}`, {
      cache: "no-store",
    }),
  ]);

  if (bookingResult.status !== "fulfilled") {
    throw new Error("โหลดตัวเลขเมนูไม่สำเร็จ");
  }

  const response = bookingResult.value;
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result?.success) {
    throw new Error(result?.error || "โหลดตัวเลขเมนูไม่สำเร็จ");
  }

  let membersCount = 0;
  if (memberResult.status === "fulfilled") {
    const memberJson = await memberResult.value.json().catch(() => ({}));
    membersCount = memberResult.value.ok && memberJson?.success ? Number(memberJson.total || 0) : 0;
  }

  const remoteCounts = result.counts || emptyDashboardCounts;
  const trashItems = Number(remoteCounts.trashItems || 0);
  const emailHistory = dedupeRecords(
    safeReadArray(`${brandId}_email_history`),
    brandId,
    "email-history"
  );
  const mailTrashItems = dedupeRecords(
    safeReadArray(`${brandId}_mail_trash`),
    brandId,
    "mail-trash"
  );
  const emailCounts = calculateDashboardCounts({ brandId, emailHistory });
  const baseCounts = {
    ...emptyDashboardCounts,
    ...remoteCounts,
    emailAttention: emailCounts.emailAttention,
  };
  const notificationsCount = countUnreadNotifications(brandId);

  return {
    ...baseCounts,
    trashItems: trashItems + mailTrashItems.length,
    calendarJobs: remoteCounts.calendarJobs || 0,
    customerRequests: countActiveCustomerRequests(brandId),
    membersCount,
    notificationsCount:
      notificationsCount > 0 ? notificationsCount : baseCounts.upcoming7Days,
    reportsCount: 0,
  };
};

export const getBrandFromStorageKey = (key) => {
  const normalizedKey = String(key || "");
  return (
    BRAND_IDS.find(
      (brandId) =>
        normalizedKey.startsWith(`${brandId}_`) ||
        normalizedKey === `pendingBookingPrefill_${brandId}`
    ) || ""
  );
};

export const isBrandStorageKey = (key, brandId) => {
  if (!key) return true;
  const keyBrand = getBrandFromStorageKey(key);
  return keyBrand === brandId || key === "central_admin_users";
};

const dispatchSidebarCountsEvent = ({ brandId, key, action }) => {
  if (typeof window === "undefined" || !brandId) return;

  window.dispatchEvent(
    new CustomEvent(SIDEBAR_COUNTS_EVENT, {
      detail: { brandId, key, action },
    })
  );
};

export const installSidebarCountsStorageBridge = () => {
  if (typeof window === "undefined" || window.__sidebarCountsBridgeInstalled) {
    return;
  }

  try {
    const storagePrototype = window.Storage?.prototype;
    if (!storagePrototype) return;

    const originalSetItem = storagePrototype.setItem;
    const originalRemoveItem = storagePrototype.removeItem;
    const originalClear = storagePrototype.clear;

    window.__sidebarCountsBridgeInstalled = true;

    storagePrototype.setItem = function setItemWithSidebarCountsEvent(key, value) {
      const result = originalSetItem.apply(this, [key, value]);

      if (this === window.localStorage) {
        const brandId = getBrandFromStorageKey(key);
        dispatchSidebarCountsEvent({ brandId, key, action: "setItem" });
      }

      return result;
    };

    storagePrototype.removeItem = function removeItemWithSidebarCountsEvent(key) {
      const result = originalRemoveItem.apply(this, [key]);

      if (this === window.localStorage) {
        const brandId = getBrandFromStorageKey(key);
        dispatchSidebarCountsEvent({ brandId, key, action: "removeItem" });
      }

      return result;
    };

    storagePrototype.clear = function clearWithSidebarCountsEvent() {
      const result = originalClear.apply(this);

      if (this === window.localStorage) {
        BRAND_IDS.forEach((brandId) =>
          dispatchSidebarCountsEvent({ brandId, key: "", action: "clear" })
        );
      }

      return result;
    };
  } catch {
    window.__sidebarCountsBridgeInstalled = false;
  }
};

const CLOSED_STATUSES = new Set(["completed", "finished", "closed", "done"]);
const ACTIONABLE_EMAIL_STATUSES = new Set([
  "draft",
  "pending",
  "queued",
  "error",
  "failed",
]);

const belongsToBrand = (item, brandId) => {
  const itemBrand = String(item?.brandId || item?.brand || "").trim();
  return !itemBrand || itemBrand === brandId;
};

const isClosedJob = (item) => {
  const status = String(item?.status || item?.jobStatus || item?.bookingStatus || "")
    .trim()
    .toLowerCase();

  return CLOSED_STATUSES.has(status);
};

const hasOutstandingPayment = (item) => {
  const finalPrice = Number(item?.finalPrice || 0);
  const paidAmount = Number(item?.totalPaid ?? item?.paymentAmount ?? 0);
  const remainingPayment = Number(
    item?.remainingPayment ?? Math.max(finalPrice - paidAmount, 0)
  );
  const paymentProgress = String(item?.paymentProgress || "").trim();

  return (
    finalPrice > 0 &&
    remainingPayment > 0 &&
    paymentProgress !== "ชำระครบแล้ว"
  );
};

const isActionableEmail = (item) =>
  ACTIONABLE_EMAIL_STATUSES.has(
    String(item?.status || "").trim().toLowerCase()
  );

export const emptyDashboardCounts = {
  activeCustomers: 0,
  archivedJobs: 0,
  trashItems: 0,
  todayJobs: 0,
  upcoming7Days: 0,
  monthJobs: 0,
  draftBookings: 0,
  pendingPayments: 0,
  emailAttention: 0,
  alerts: [],
};

export function calculateDashboardCounts({
  brandId,
  customers = [],
  archiveItems = [],
  trashItems = [],
  emailHistory = [],
  hasBookingDraft = false,
  now = new Date(),
}) {
  const brandCustomers = customers.filter((item) => belongsToBrand(item, brandId));
  const brandArchiveItems = archiveItems.filter((item) =>
    belongsToBrand(item, brandId)
  );
  const brandTrashItems = trashItems.filter((item) => belongsToBrand(item, brandId));
  const brandEmailHistory = emailHistory.filter((item) =>
    belongsToBrand(item, brandId)
  );

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let todayJobs = 0;
  let upcoming7Days = 0;
  let monthJobs = 0;
  const alerts = [];

  brandCustomers.forEach((item) => {
    if (!item?.eventDate) return;

    const eventDate = new Date(item.eventDate);
    if (Number.isNaN(eventDate.getTime())) return;
    eventDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (eventDate - today) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) todayJobs += 1;
    if (
      eventDate.getFullYear() === currentYear &&
      eventDate.getMonth() === currentMonth
    ) {
      monthJobs += 1;
    }

    if (diffDays > 0 && diffDays <= 7) {
      upcoming7Days += 1;
      alerts.push({
        customerName: item.customerName,
        service: item.service,
        diffDays,
      });
    }
  });

  return {
    activeCustomers: brandCustomers.length,
    archivedJobs: brandArchiveItems.length + brandCustomers.filter(isClosedJob).length,
    trashItems: brandTrashItems.length,
    todayJobs,
    upcoming7Days,
    monthJobs,
    draftBookings: hasBookingDraft ? 1 : 0,
    pendingPayments: brandCustomers.filter(hasOutstandingPayment).length,
    emailAttention: brandEmailHistory.filter(isActionableEmail).length,
    alerts: alerts.sort((a, b) => a.diffDays - b.diffDays),
  };
}

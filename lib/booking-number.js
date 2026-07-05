export const BOOKING_NUMBER_PATTERN = /^BK-\d{8}-(\d{4})$/;

export const getBookingSequence = (bookingNumber) => {
  const match = String(bookingNumber || "").match(BOOKING_NUMBER_PATTERN);
  if (!match) return null;

  const sequence = Number(match[1]);
  return Number.isInteger(sequence) && sequence >= 1 && sequence <= 9999
    ? sequence
    : null;
};

export const formatBookingDatePart = (date = new Date()) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}`;

export const formatBookingNumber = (date = new Date(), sequence = 1) =>
  `BK-${formatBookingDatePart(date)}-${String(sequence).padStart(4, "0")}`;

export const getNextBookingSequence = (items = []) => {
  const usedSequences = new Set(
    items
      .map((item) => getBookingSequence(item?.bookingNumber))
      .filter((sequence) => sequence != null)
  );

  if (usedSequences.size === 0) return 1;

  const highestSequence = Math.max(...usedSequences);

  if (!usedSequences.has(1)) {
    return highestSequence >= 9999 ? null : highestSequence + 1;
  }

  for (let sequence = 1; sequence <= highestSequence; sequence += 1) {
    if (!usedSequences.has(sequence)) {
      return sequence;
    }
  }

  return highestSequence >= 9999 ? null : highestSequence + 1;
};

export const isBookingNumberUsed = (bookingNumber, items = []) =>
  items.some((item) => String(item?.bookingNumber || "") === bookingNumber);

const readArrayFromStorageKey = (key) => {
  if (typeof localStorage === "undefined") return [];

  try {
    const parsedValue = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error(`Cannot read booking number source: ${key}`, error);
    return [];
  }
};

const normalizeSupabaseBookingRow = (row) => {
  const bookingData = row?.booking_data || {};

  return {
    ...bookingData,
    brandId: bookingData.brandId || "",
    bookingNumber: bookingData.bookingNumber || row?.booking_number || "",
    deleted: row?.deleted ?? bookingData.deleted ?? false,
    archived: row?.archived ?? bookingData.archived ?? false,
  };
};

const belongsToBrand = (brandId, item) => {
  const itemBrandId = String(item?.brandId || "").trim();
  return !itemBrandId || itemBrandId === brandId;
};

export const getLocalBookingNumberSources = (brandId, extraItems = []) => {
  const keys = [
    `${brandId}_customers`,
    `${brandId}_archives`,
    `${brandId}_trash`,
  ];

  return [...keys.flatMap(readArrayFromStorageKey), ...extraItems].filter(
    (item) => belongsToBrand(brandId, item)
  );
};

export const loadBrandBookingNumberSources = async ({
  brandId,
  supabaseClient,
  extraItems = [],
} = {}) => {
  const localItems = getLocalBookingNumberSources(brandId, extraItems);
  let remoteItems = [];

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from("bookings")
        .select("booking_number, booking_data, deleted, archived");

      if (error) throw error;

      remoteItems = (Array.isArray(data) ? data : [])
        .map(normalizeSupabaseBookingRow)
        .filter((item) => item.brandId === brandId);
    } catch (error) {
      console.error("Cannot load Supabase booking number sources", error);
    }
  }

  const dedupedByBookingNumber = new Map();

  [...localItems, ...remoteItems].forEach((item) => {
    const bookingNumber = String(item?.bookingNumber || "");
    if (!bookingNumber) return;
    dedupedByBookingNumber.set(bookingNumber, item);
  });

  return Array.from(dedupedByBookingNumber.values());
};

export const getNextAvailableBookingNumber = async ({
  brandId,
  supabaseClient,
  date = new Date(),
  extraItems = [],
} = {}) => {
  const sources = await loadBrandBookingNumberSources({
    brandId,
    supabaseClient,
    extraItems,
  });
  const sequence = getNextBookingSequence(sources);

  return {
    sequence,
    bookingNumber: sequence == null ? "" : formatBookingNumber(date, sequence),
    sources,
  };
};

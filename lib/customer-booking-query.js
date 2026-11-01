// Fetch only list metadata; booking payloads may contain large inline slip images.
const DATA_FIELDS = [
  "brandId", "brand", "bookingNumber", "customerName", "phone", "email",
  "service", "location", "eventDate", "formattedEventDate", "startTime", "endTime",
  "jobStatus", "status", "bookingStatus", "archived", "deleted", "finalPrice",
  "totalPaid", "paymentAmount", "remainingPayment", "paymentProgress",
  "googleCalendarEventId", "googleCalendarSyncStatus", "googleCalendarSyncError",
  "calendarColor", "createdAt", "updatedAt", "customerSource", "customerSourceDetail",
];

const LIST_COLUMNS = [
  "id", "booking_number", "customer_name", "phone", "email", "service", "location",
  "event_date", "job_status", "archived", "deleted", "created_at", "updated_at",
  ...DATA_FIELDS.map((key) => `list_${key}:booking_data->${key}`),
].join(",");

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} brandId
 * @param {(row: Record<string, any>) => Record<string, any>} normalizeSummary
 */
export async function readCustomerBookingList(client, brandId, normalizeSummary) {
  const bookings = [];
  let offset = 0;
  // Continue until an empty batch, including when Supabase caps a requested range.
  // A unique ordering keeps rows with a reused booking number distinct.
  for (;;) {
    const { data, error } = await client.from("bookings")
      .select(LIST_COLUMNS)
      .eq("deleted", false)
      .eq("archived", false)
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error) throw error;
    if (!data?.length) break;
    offset += data.length;
    // The JSON projection is assembled dynamically, beyond Supabase's literal
    // select-string type parser. Values are reconstructed before normalization.
    const rows = /** @type {Record<string, unknown>[]} */ (/** @type {unknown} */ (data));
    for (const row of rows) {
      const bookingData = Object.fromEntries(DATA_FIELDS.map((key) => [key, row[`list_${key}`]]));
      const booking = normalizeSummary({ ...row, booking_data: bookingData });
      // Apply the same brand resolver and draft exclusion as the existing list.
      if (booking.brandId !== brandId || booking.bookingStatus === "draft") continue;
      bookings.push({
        ...booking,
        eventDate: row.event_date || booking.eventDate || bookingData.formattedEventDate || "",
      });
    }
  }
  return bookings;
}

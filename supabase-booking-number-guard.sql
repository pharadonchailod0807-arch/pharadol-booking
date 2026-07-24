-- Booking number safety guard.
-- Run this in Supabase SQL editor before or with the production deployment.
-- It does not change historical booking numbers.

create unique index if not exists bookings_brand_booking_number_guard_idx
on public.bookings (
  (coalesce(booking_data->>'brandId', booking_data->>'brand', '')),
  booking_number
)
where booking_number is not null and booking_number <> '';

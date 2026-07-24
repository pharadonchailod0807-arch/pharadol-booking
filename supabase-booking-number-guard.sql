-- Booking number safety guard.
-- Run this in Supabase SQL editor before or with the production deployment.
-- It does not change historical booking numbers. Draft rows created by the
-- previous preview-reservation bug are excluded from the active-number guard.

drop index if exists bookings_brand_booking_number_guard_idx;

create unique index bookings_brand_booking_number_guard_idx
on public.bookings (
  (coalesce(booking_data->>'brandId', booking_data->>'brand', '')),
  booking_number
)
where booking_number is not null
  and booking_number <> ''
  and coalesce(booking_data->>'bookingStatus', booking_data->>'status', job_status, '') <> 'draft';

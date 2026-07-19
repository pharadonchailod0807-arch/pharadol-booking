alter table public.customer_requests
add column if not exists deleted_at timestamptz;

create index if not exists customer_requests_brand_deleted_idx
on public.customer_requests (brand, deleted_at, created_at desc);

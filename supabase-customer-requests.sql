create extension if not exists pgcrypto;

create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('pharadol', 'adisorn')),
  customer_name text not null,
  phone text not null,
  email text,
  event_location text not null,
  event_date date not null,
  note text,
  slip_url text,
  slip_file_name text,
  slip_file_type text,
  status text not null default 'new' check (status in ('new', 'viewed', 'contacted', 'converted', 'created_booking')),
  source text not null default 'customer_form',
  booking_id text,
  created_at timestamptz not null default now()
);

create index if not exists customer_requests_brand_status_idx
on public.customer_requests (brand, status, created_at desc);

alter table public.customer_requests enable row level security;

drop policy if exists "customer requests public select" on public.customer_requests;
drop policy if exists "customer requests public insert" on public.customer_requests;
drop policy if exists "customer requests public update" on public.customer_requests;
drop policy if exists "customer requests public delete" on public.customer_requests;

create policy "customer requests public select"
on public.customer_requests
for select
to anon
using (true);

create policy "customer requests public insert"
on public.customer_requests
for insert
to anon
with check (
  brand in ('pharadol', 'adisorn')
  and status = 'new'
  and source = 'customer_form'
);

create policy "customer requests public update"
on public.customer_requests
for update
to anon
using (brand in ('pharadol', 'adisorn'))
with check (brand in ('pharadol', 'adisorn'));

create policy "customer requests public delete"
on public.customer_requests
for delete
to anon
using (brand in ('pharadol', 'adisorn'));

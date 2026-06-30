create table if not exists public.autocomplete_history (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null check (brand_id in ('pharadol', 'adisorn')),
  field_name text not null check (
    field_name in ('customerName', 'phone', 'service', 'location')
  ),
  value text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (brand_id, field_name, value)
);

alter table public.autocomplete_history enable row level security;

drop policy if exists "autocomplete history public select" on public.autocomplete_history;
drop policy if exists "autocomplete history public insert" on public.autocomplete_history;
drop policy if exists "autocomplete history public update" on public.autocomplete_history;
drop policy if exists "autocomplete history public delete" on public.autocomplete_history;

create policy "autocomplete history public select"
on public.autocomplete_history
for select
to anon
using (true);

create policy "autocomplete history public insert"
on public.autocomplete_history
for insert
to anon
with check (brand_id in ('pharadol', 'adisorn'));

create policy "autocomplete history public update"
on public.autocomplete_history
for update
to anon
using (brand_id in ('pharadol', 'adisorn'))
with check (brand_id in ('pharadol', 'adisorn'));

create policy "autocomplete history public delete"
on public.autocomplete_history
for delete
to anon
using (brand_id in ('pharadol', 'adisorn'));

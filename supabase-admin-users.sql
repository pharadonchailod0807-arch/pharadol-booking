create table if not exists public.admin_users (
  id text primary key,
  name text not null,
  username text not null unique,
  password text not null,
  role text not null,
  brands jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "admin users public select" on public.admin_users;
drop policy if exists "admin users public insert" on public.admin_users;
drop policy if exists "admin users public update" on public.admin_users;
drop policy if exists "admin users public delete" on public.admin_users;

create policy "admin users public select"
on public.admin_users
for select
to anon
using (true);

create policy "admin users public insert"
on public.admin_users
for insert
to anon
with check (true);

create policy "admin users public update"
on public.admin_users
for update
to anon
using (true)
with check (true);

create policy "admin users public delete"
on public.admin_users
for delete
to anon
using (true);

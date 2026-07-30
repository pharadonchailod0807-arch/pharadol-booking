create table if not exists public.auth_login_attempts (
  key_hash text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.auth_login_attempts enable row level security;

drop policy if exists "auth login attempts public select" on public.auth_login_attempts;
drop policy if exists "auth login attempts public insert" on public.auth_login_attempts;
drop policy if exists "auth login attempts public update" on public.auth_login_attempts;

create policy "auth login attempts public select"
on public.auth_login_attempts
for select
to anon
using (true);

create policy "auth login attempts public insert"
on public.auth_login_attempts
for insert
to anon
with check (true);

create policy "auth login attempts public update"
on public.auth_login_attempts
for update
to anon
using (true)
with check (true);

create table if not exists public.auth_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.admin_users(id) on delete cascade,
  provider text not null check (provider in ('google', 'facebook', 'apple', 'line')),
  provider_account_id text not null,
  verified_email text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);

create index if not exists auth_provider_accounts_user_id_idx
on public.auth_provider_accounts(user_id);

alter table public.auth_provider_accounts enable row level security;

drop policy if exists "auth provider accounts public select" on public.auth_provider_accounts;
drop policy if exists "auth provider accounts public insert" on public.auth_provider_accounts;
drop policy if exists "auth provider accounts public update" on public.auth_provider_accounts;

create policy "auth provider accounts public select"
on public.auth_provider_accounts
for select
to anon
using (true);

create policy "auth provider accounts public insert"
on public.auth_provider_accounts
for insert
to anon
with check (true);

create policy "auth provider accounts public update"
on public.auth_provider_accounts
for update
to anon
using (true)
with check (true);

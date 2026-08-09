create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  user_id text,
  username text,
  brand text,
  role text,
  action text not null,
  resource_type text,
  resource_id text,
  result text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text
);

create index if not exists audit_logs_timestamp_idx
  on public.audit_logs (timestamp desc);

create index if not exists audit_logs_brand_action_idx
  on public.audit_logs (brand, action, timestamp desc);

create index if not exists audit_logs_user_id_idx
  on public.audit_logs (user_id, timestamp desc);

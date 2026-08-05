create extension if not exists pgcrypto;

create table if not exists public.member_sequences (
  brand text primary key check (brand in ('pharadol', 'adisorn')),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('pharadol', 'adisorn')),
  member_code text not null,
  profile_image_url text,
  first_name text not null,
  last_name text not null,
  nickname text,
  birth_date date,
  gender text,
  gender_other text,
  phone text,
  email text,
  line_id text,
  facebook text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  address_house_number text,
  address_building_village text,
  address_moo text,
  address_soi text,
  address_road text,
  address_subdistrict text,
  address_district text,
  address_province text,
  address_postal_code text,
  bank_name text,
  bank_name_other text,
  bank_account_name text,
  bank_account_number text,
  position text,
  position_other text,
  status text not null default 'ทดลองงาน',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by text,
  updated_by text,
  deleted_by text,
  constraint members_brand_member_code_key unique (brand, member_code),
  constraint members_status_check check (status in ('ปกติ', 'ทดลองงาน', 'พักงานชั่วคราว', 'ระงับสมาชิก', 'ออกจากทีม')),
  constraint members_gender_check check (gender is null or gender in ('ชาย', 'หญิง', 'อื่นๆ')),
  constraint members_birth_date_check check (birth_date is null or birth_date <= current_date),
  constraint members_postal_code_check check (address_postal_code is null or address_postal_code ~ '^[0-9]{5}$')
);

create index if not exists members_brand_deleted_updated_idx
on public.members (brand, deleted_at, updated_at desc);

create index if not exists members_brand_status_idx
on public.members (brand, status);

create index if not exists members_brand_position_idx
on public.members (brand, position);

create index if not exists members_brand_name_idx
on public.members (brand, first_name, last_name);

create index if not exists members_brand_contact_idx
on public.members (brand, phone, email);

create or replace function public.create_member_with_sequence(
  p_brand text,
  p_member jsonb,
  p_created_by text default null
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
  next_code text;
  inserted_member public.members;
begin
  if p_brand not in ('pharadol', 'adisorn') then
    raise exception 'Invalid member brand';
  end if;

  insert into public.member_sequences (brand, last_number)
  values (p_brand, 0)
  on conflict (brand) do nothing;

  update public.member_sequences
  set last_number = last_number + 1,
      updated_at = now()
  where brand = p_brand
  returning last_number into next_number;

  next_code := 'MB-' || lpad(next_number::text, 4, '0');

  insert into public.members (
    brand,
    member_code,
    profile_image_url,
    first_name,
    last_name,
    nickname,
    birth_date,
    gender,
    gender_other,
    phone,
    email,
    line_id,
    facebook,
    emergency_contact_name,
    emergency_contact_relationship,
    emergency_contact_phone,
    address_house_number,
    address_building_village,
    address_moo,
    address_soi,
    address_road,
    address_subdistrict,
    address_district,
    address_province,
    address_postal_code,
    bank_name,
    bank_name_other,
    bank_account_name,
    bank_account_number,
    position,
    position_other,
    status,
    notes,
    created_by,
    updated_by
  )
  values (
    p_brand,
    next_code,
    nullif(p_member->>'profile_image_url', ''),
    trim(p_member->>'first_name'),
    trim(p_member->>'last_name'),
    nullif(p_member->>'nickname', ''),
    nullif(p_member->>'birth_date', '')::date,
    nullif(p_member->>'gender', ''),
    nullif(p_member->>'gender_other', ''),
    nullif(p_member->>'phone', ''),
    nullif(p_member->>'email', ''),
    nullif(p_member->>'line_id', ''),
    nullif(p_member->>'facebook', ''),
    nullif(p_member->>'emergency_contact_name', ''),
    nullif(p_member->>'emergency_contact_relationship', ''),
    nullif(p_member->>'emergency_contact_phone', ''),
    nullif(p_member->>'address_house_number', ''),
    nullif(p_member->>'address_building_village', ''),
    nullif(p_member->>'address_moo', ''),
    nullif(p_member->>'address_soi', ''),
    nullif(p_member->>'address_road', ''),
    nullif(p_member->>'address_subdistrict', ''),
    nullif(p_member->>'address_district', ''),
    nullif(p_member->>'address_province', ''),
    nullif(p_member->>'address_postal_code', ''),
    nullif(p_member->>'bank_name', ''),
    nullif(p_member->>'bank_name_other', ''),
    nullif(p_member->>'bank_account_name', ''),
    nullif(p_member->>'bank_account_number', ''),
    nullif(p_member->>'position', ''),
    nullif(p_member->>'position_other', ''),
    coalesce(nullif(p_member->>'status', ''), 'ทดลองงาน'),
    nullif(p_member->>'notes', ''),
    nullif(p_created_by, ''),
    nullif(p_created_by, '')
  )
  returning * into inserted_member;

  return inserted_member;
end;
$$;

alter table public.member_sequences enable row level security;
alter table public.members enable row level security;

drop policy if exists "members anon select" on public.members;
drop policy if exists "members anon insert" on public.members;
drop policy if exists "members anon update" on public.members;
drop policy if exists "members anon delete" on public.members;
drop policy if exists "member sequences anon select" on public.member_sequences;
drop policy if exists "member sequences anon update" on public.member_sequences;

create policy "members anon select"
on public.members
for select
to anon
using (brand in ('pharadol', 'adisorn'));

create policy "members anon insert"
on public.members
for insert
to anon
with check (brand in ('pharadol', 'adisorn'));

create policy "members anon update"
on public.members
for update
to anon
using (brand in ('pharadol', 'adisorn'))
with check (brand in ('pharadol', 'adisorn'));

create policy "members anon delete"
on public.members
for delete
to anon
using (brand in ('pharadol', 'adisorn'));

create policy "member sequences anon select"
on public.member_sequences
for select
to anon
using (brand in ('pharadol', 'adisorn'));

create policy "member sequences anon update"
on public.member_sequences
for all
to anon
using (brand in ('pharadol', 'adisorn'))
with check (brand in ('pharadol', 'adisorn'));

grant execute on function public.create_member_with_sequence(text, jsonb, text) to anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-profiles',
  'member-profiles',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "member profiles public read" on storage.objects;
drop policy if exists "member profiles anon insert" on storage.objects;
drop policy if exists "member profiles anon update" on storage.objects;
drop policy if exists "member profiles anon delete" on storage.objects;

create policy "member profiles public read"
on storage.objects
for select
to anon
using (bucket_id = 'member-profiles');

create policy "member profiles anon insert"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'member-profiles'
  and (storage.foldername(name))[1] in ('pharadol', 'adisorn')
);

create policy "member profiles anon update"
on storage.objects
for update
to anon
using (bucket_id = 'member-profiles')
with check (
  bucket_id = 'member-profiles'
  and (storage.foldername(name))[1] in ('pharadol', 'adisorn')
);

create policy "member profiles anon delete"
on storage.objects
for delete
to anon
using (
  bucket_id = 'member-profiles'
  and (storage.foldername(name))[1] in ('pharadol', 'adisorn')
);

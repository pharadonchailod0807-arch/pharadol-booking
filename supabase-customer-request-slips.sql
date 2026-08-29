insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-slips',
  'customer-slips',
  true,
  4194304,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "customer slips public read" on storage.objects;

create policy "customer slips public read"
on storage.objects
for select
to anon
using (bucket_id = 'customer-slips');

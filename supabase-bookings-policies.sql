alter table public.bookings enable row level security;

drop policy if exists "bookings public select" on public.bookings;
drop policy if exists "bookings public insert" on public.bookings;
drop policy if exists "bookings public update" on public.bookings;
drop policy if exists "bookings public delete" on public.bookings;

create policy "bookings public select"
on public.bookings
for select
to anon
using (true);

create policy "bookings public insert"
on public.bookings
for insert
to anon
with check (true);

create policy "bookings public update"
on public.bookings
for update
to anon
using (true)
with check (true);

create policy "bookings public delete"
on public.bookings
for delete
to anon
using (true);

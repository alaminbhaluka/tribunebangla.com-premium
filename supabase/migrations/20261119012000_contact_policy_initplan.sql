drop policy if exists "Staff can review contact messages" on public.contact_messages;
create policy "Staff can review contact messages" on public.contact_messages
for select to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('super_admin','admin','editor'));
drop policy if exists "Staff can update contact message status" on public.contact_messages;
create policy "Staff can update contact message status" on public.contact_messages
for update to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('super_admin','admin','editor'))
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('super_admin','admin','editor'));
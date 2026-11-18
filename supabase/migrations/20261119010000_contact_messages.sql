create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  contact text not null check (char_length(contact) between 3 and 180),
  subject text not null check (char_length(subject) between 2 and 180),
  message text not null check (char_length(message) between 5 and 10000),
  status text not null default 'new' check (status in ('new','read','resolved','spam')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
grant insert on public.contact_messages to anon, authenticated;
grant select, update on public.contact_messages to authenticated;
drop policy if exists "Public can submit contact messages" on public.contact_messages;
create policy "Public can submit contact messages" on public.contact_messages
for insert to anon, authenticated
with check (
  char_length(name) between 2 and 120
  and char_length(contact) between 3 and 180
  and char_length(subject) between 2 and 180
  and char_length(message) between 5 and 10000
);
drop policy if exists "Staff can review contact messages" on public.contact_messages;
create policy "Staff can review contact messages" on public.contact_messages
for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin','admin','editor'));
drop policy if exists "Staff can update contact message status" on public.contact_messages;
create policy "Staff can update contact message status" on public.contact_messages
for update to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin','admin','editor'))
with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin','admin','editor'));

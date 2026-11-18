-- Phone/password login without SMS OTP, plus representative work-area fields.
alter table public.staff_applications
  add column if not exists division text,
  add column if not exists upazila text;

create or replace function public.normalize_bd_phone(input_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw_value text := btrim(coalesce(input_phone, ''));
  digits text;
begin
  if raw_value = '' then return null; end if;
  digits := regexp_replace(raw_value, '[^0-9]', '', 'g');
  if digits like '01%' and length(digits) = 11 then
    return '+88' || digits;
  elsif digits like '8801%' and length(digits) = 13 then
    return '+' || digits;
  elsif digits like '008801%' and length(digits) = 15 then
    return '+' || substr(digits, 3);
  elsif left(raw_value, 1) = '+' and length(digits) between 10 and 15 then
    return '+' || digits;
  end if;
  raise exception 'Invalid phone number format. Use Bangladesh mobile number such as 01XXXXXXXXX.';
end;
$$;

create unique index if not exists profiles_phone_normalized_unique
  on public.profiles (public.normalize_bd_phone(phone))
  where phone is not null and btrim(phone) <> '';

create or replace function public.sync_profile_phone_to_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_phone text;
begin
  normalized_phone := public.normalize_bd_phone(new.phone);
  update auth.users
     set phone = normalized_phone,
         phone_confirmed_at = case when normalized_phone is null then null else coalesce(phone_confirmed_at, now()) end,
         updated_at = now()
   where id = new.id
     and phone is distinct from normalized_phone;
  return new;
end;
$$;

drop trigger if exists profiles_sync_phone_to_auth on public.profiles;
create trigger profiles_sync_phone_to_auth
after insert or update of phone on public.profiles
for each row execute function public.sync_profile_phone_to_auth();

-- Backfill existing reader phone numbers into Supabase Auth; no SMS is sent.
update public.profiles
   set phone = public.normalize_bd_phone(phone)
 where phone is not null and btrim(phone) <> '';

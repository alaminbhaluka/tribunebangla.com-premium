create sequence if not exists private.reporter_code_seq
  start with 10000 increment by 1 minvalue 10000 maxvalue 99999 no cycle;

alter table public.reporter_profiles
  add column if not exists reporter_code text;

create unique index if not exists reporter_profiles_reporter_code_uidx
  on public.reporter_profiles(reporter_code)
  where reporter_code is not null;

create or replace function private.assign_reporter_code()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.reporter_code is null or btrim(new.reporter_code) = '' then
    new.reporter_code := nextval('private.reporter_code_seq')::text;
  end if;
  return new;
end;
$$;
revoke all on function private.assign_reporter_code() from public, anon, authenticated;

drop trigger if exists reporter_code_before_insert on public.reporter_profiles;
create trigger reporter_code_before_insert
before insert on public.reporter_profiles
for each row execute function private.assign_reporter_code();

update public.reporter_profiles
set reporter_code = nextval('private.reporter_code_seq')::text
where reporter_code is null;

drop function if exists public.get_reporter_profile(uuid);
drop function if exists private.get_reporter_profile(uuid);

create function private.get_reporter_profile(p_user_id uuid)
returns table(reporter_code text, display_name text, reporter_type text, designation text, assigned_area text)
language sql
security definer
set search_path=''
as $$
  select rp.reporter_code, p.display_name::text, rp.reporter_type, rp.designation, rp.assigned_area
  from public.reporter_profiles rp
  join public.profiles p on p.id=rp.user_id
  where rp.user_id=p_user_id and rp.is_active=true
  limit 1
$$;
revoke all on function private.get_reporter_profile(uuid) from public;
grant usage on schema private to anon;
grant execute on function private.get_reporter_profile(uuid) to anon, authenticated;

create function public.get_reporter_profile(p_user_id uuid)
returns table(reporter_code text, display_name text, reporter_type text, designation text, assigned_area text)
language sql
security invoker
set search_path=''
as $$ select * from private.get_reporter_profile(p_user_id) $$;
revoke all on function public.get_reporter_profile(uuid) from public;
grant execute on function public.get_reporter_profile(uuid) to anon, authenticated;

-- Secure admin-only account directory and editing operations.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin');
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists profiles_read_admin on public.profiles;
create policy profiles_read_admin on public.profiles for select to authenticated using (public.is_admin());
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles for insert to authenticated with check (public.is_admin());

create or replace function public.prevent_self_role_escalation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator can change account roles' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_self_role_escalation() from public, anon, authenticated;
drop trigger if exists profiles_prevent_self_role_escalation on public.profiles;
create trigger profiles_prevent_self_role_escalation before update of role on public.profiles
for each row execute function public.prevent_self_role_escalation();

create or replace function public.admin_list_accounts(p_search text default null)
returns table (
  id uuid, email text, full_name text, phone text, role text,
  division text, district text, upazila text, address_line text,
  newsletter_opt_in boolean, created_at timestamptz, last_sign_in_at timestamptz,
  banned_until timestamptz, application_id uuid, application_status text,
  desired_role text, designation text, representative_id integer,
  representative_code text, experience text, portfolio_url text,
  statement text, review_note text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, p.full_name, p.phone, p.role, p.division, p.district,
    p.upazila, p.address_line, p.newsletter_opt_in, u.created_at, u.last_sign_in_at,
    u.banned_until, a.id, a.status, a.desired_role, a.designation, a.representative_id,
    a.representative_code, a.experience, a.portfolio_url, a.statement, a.review_note
  from auth.users u join public.profiles p on p.id = u.id
  left join lateral (
    select sa.* from public.staff_applications sa
    where sa.user_id = u.id order by sa.created_at desc limit 1
  ) a on true
  where coalesce(p_search, '') = ''
    or concat_ws(' ',u.email,p.full_name,p.phone,p.role,p.division,p.district,p.upazila,a.representative_code,a.designation)
       ilike '%' || p_search || '%'
  order by u.created_at desc limit 1000;
end;
$$;
revoke all on function public.admin_list_accounts(text) from public, anon;
grant execute on function public.admin_list_accounts(text) to authenticated;

create or replace function public.admin_update_account(
  p_user_id uuid, p_email text, p_full_name text, p_phone text, p_role text,
  p_division text, p_district text, p_upazila text, p_address_line text,
  p_newsletter_opt_in boolean, p_application_status text, p_desired_role text,
  p_designation text, p_representative_id integer, p_representative_code text,
  p_review_note text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare old_role text; admin_count integer; existing_application uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_user_id is null then raise exception 'User is required'; end if;
  if p_role not in ('reader','reporter','editor','admin') then raise exception 'Invalid account role'; end if;
  if p_application_status is not null and p_application_status not in ('pending','approved','inactive','rejected') then raise exception 'Invalid application status'; end if;
  if p_desired_role is not null and p_desired_role not in ('reporter','photographer','editor') then raise exception 'Invalid representative type'; end if;
  if p_representative_id is not null and p_representative_id not between 10000 and 99999 then raise exception 'Representative ID must contain five digits'; end if;
  if p_representative_code is not null and p_representative_code !~ '^TB-[A-Z0-9]+(-[A-Z0-9]+)*$' then raise exception 'Invalid representative code'; end if;

  select p.role into old_role from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  if old_role = 'admin' and p_role <> 'admin' then
    select count(*) into admin_count from public.profiles p where p.role = 'admin';
    if admin_count <= 1 then raise exception 'The last administrator cannot be demoted'; end if;
  end if;

  -- Email is read-only in this panel; change it through Supabase Auth.
  update public.profiles set
    full_name = btrim(coalesce(p_full_name,'')),
    phone = nullif(btrim(coalesce(p_phone,'')), ''),
    role = p_role,
    division = nullif(btrim(coalesce(p_division,'')), ''),
    district = nullif(btrim(coalesce(p_district,'')), ''),
    upazila = nullif(btrim(coalesce(p_upazila,'')), ''),
    address_line = nullif(btrim(coalesce(p_address_line,'')), ''),
    newsletter_opt_in = coalesce(p_newsletter_opt_in,false),
    updated_at = now()
  where id = p_user_id;

  select sa.id into existing_application from public.staff_applications sa
  where sa.user_id = p_user_id order by sa.created_at desc limit 1;
  if existing_application is not null then
    update public.staff_applications set
      full_name = btrim(coalesce(p_full_name,'')),
      phone = coalesce(nullif(btrim(coalesce(p_phone,'')), ''), phone),
      division = nullif(btrim(coalesce(p_division,'')), ''),
      district = coalesce(nullif(btrim(coalesce(p_district,'')), ''), ''),
      upazila = nullif(btrim(coalesce(p_upazila,'')), ''),
      status = coalesce(p_application_status,case when p_role = 'reporter' then 'approved' else status end),
      desired_role = coalesce(p_desired_role,desired_role),
      designation = coalesce(nullif(btrim(coalesce(p_designation,'')), ''),designation),
      representative_id = coalesce(p_representative_id,representative_id),
      representative_code = coalesce(nullif(btrim(coalesce(p_representative_code,'')), ''),representative_code),
      review_note = coalesce(p_review_note,review_note),
      updated_at = now()
    where id = existing_application;
  elsif p_role = 'reporter' then
    insert into public.staff_applications (
      user_id,full_name,phone,division,district,upazila,desired_role,designation,
      status,statement,review_note,representative_id,representative_code
    ) values (
      p_user_id,btrim(coalesce(p_full_name,'')),coalesce(nullif(btrim(coalesce(p_phone,'')), ''),'অনির্ধারিত'),
      nullif(btrim(coalesce(p_division,'')), ''),coalesce(nullif(btrim(coalesce(p_district,'')), ''),''),
      nullif(btrim(coalesce(p_upazila,'')), ''),coalesce(p_desired_role,'reporter'),
      coalesce(nullif(btrim(coalesce(p_designation,'')), ''),'সংবাদ প্রতিনিধি'),
      coalesce(p_application_status,'approved'),
      'প্রশাসনিকভাবে প্রতিনিধি অ্যাকাউন্ট তৈরি ও অনুমোদন করা হয়েছে।',
      coalesce(p_review_note,'প্রশাসনিকভাবে তৈরি'),p_representative_id,p_representative_code
    );
  end if;
end;
$$;
revoke all on function public.admin_update_account(uuid,text,text,text,text,text,text,text,text,boolean,text,text,text,integer,text,text) from public, anon;
grant execute on function public.admin_update_account(uuid,text,text,text,text,text,text,text,text,boolean,text,text,text,integer,text,text) to authenticated;

create or replace function public.admin_set_account_access(p_user_id uuid,p_disabled boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare target_role text; admin_count integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'You cannot suspend your own administrator account'; end if;
  select role into target_role from public.profiles where id = p_user_id;
  if not found then raise exception 'Account not found'; end if;
  if p_disabled and target_role = 'admin' then
    select count(*) into admin_count from public.profiles where role = 'admin';
    if admin_count <= 1 then raise exception 'The last administrator cannot be suspended'; end if;
  end if;
  update auth.users set banned_until = case when p_disabled then now() + interval '100 years' else null end,
    updated_at = now() where id = p_user_id;
end;
$$;
revoke all on function public.admin_set_account_access(uuid,boolean) from public, anon;
grant execute on function public.admin_set_account_access(uuid,boolean) to authenticated;

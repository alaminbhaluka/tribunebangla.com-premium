-- Extend administrator account editing with all representative application fields.
create or replace function public.prevent_self_role_escalation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator can change account roles' using errcode = '42501';
  end if;
  if old.id = (select auth.uid()) and old.role = 'admin' and new.role <> 'admin' then
    raise exception 'An administrator cannot demote their own account';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_self_role_escalation() from public, anon, authenticated;

drop function if exists public.admin_update_account(uuid,text,text,text,text,text,text,text,text,boolean,text,text,text,integer,text,text);
create function public.admin_update_account(
  p_user_id uuid, p_email text, p_full_name text, p_phone text, p_role text,
  p_division text, p_district text, p_upazila text, p_address_line text,
  p_newsletter_opt_in boolean, p_application_status text, p_desired_role text,
  p_designation text, p_representative_id integer, p_representative_code text,
  p_review_note text, p_experience text, p_portfolio_url text, p_statement text
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
  if p_experience is not null and length(p_experience) > 3000 then raise exception 'Experience text is too long'; end if;
  if p_portfolio_url is not null and p_portfolio_url !~ '^https://' then raise exception 'Portfolio link must use HTTPS'; end if;
  if p_statement is not null and (length(p_statement) < 30 or length(p_statement) > 3000) then raise exception 'Statement must contain 30 to 3000 characters'; end if;
  if p_application_status = 'approved' and p_role = 'reader' then p_role := 'reporter'; end if;
  if p_application_status in ('inactive','rejected') and p_role = 'reporter' then p_role := 'reader'; end if;

  select p.role into old_role from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  if old_role = 'admin' and p_role <> 'admin' then
    select count(*) into admin_count from public.profiles p where p.role = 'admin';
    if admin_count <= 1 then raise exception 'The last administrator cannot be demoted'; end if;
  end if;

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
      status = coalesce(p_application_status,case when p_role = 'reporter' then 'approved' else 'inactive' end),
      desired_role = coalesce(p_desired_role,desired_role),
      designation = coalesce(nullif(btrim(coalesce(p_designation,'')), ''),designation),
      representative_id = coalesce(p_representative_id,representative_id),
      representative_code = coalesce(nullif(btrim(coalesce(p_representative_code,'')), ''),representative_code),
      experience = coalesce(p_experience,experience),
      portfolio_url = case when p_portfolio_url is null then null else nullif(btrim(p_portfolio_url),'') end,
      statement = coalesce(p_statement,statement),
      review_note = coalesce(p_review_note,review_note),
      updated_at = now()
    where id = existing_application;
  elsif p_role = 'reporter' then
    insert into public.staff_applications (
      user_id,full_name,phone,division,district,upazila,desired_role,designation,
      status,statement,review_note,representative_id,representative_code,experience,portfolio_url
    ) values (
      p_user_id,btrim(coalesce(p_full_name,'')),coalesce(nullif(btrim(coalesce(p_phone,'')), ''),'অনির্ধারিত'),
      nullif(btrim(coalesce(p_division,'')), ''),coalesce(nullif(btrim(coalesce(p_district,'')), ''),''),
      nullif(btrim(coalesce(p_upazila,'')), ''),coalesce(p_desired_role,'reporter'),
      coalesce(nullif(btrim(coalesce(p_designation,'')), ''),'সংবাদ প্রতিনিধি'),
      coalesce(p_application_status,'approved'),
      coalesce(p_statement,'প্রশাসনিকভাবে প্রতিনিধি অ্যাকাউন্ট তৈরি ও অনুমোদন করা হয়েছে।'),
      coalesce(p_review_note,'প্রশাসনিকভাবে তৈরি'),p_representative_id,p_representative_code,
      coalesce(p_experience,''),nullif(btrim(coalesce(p_portfolio_url,'')),'')
    );
  end if;
end;
$$;
revoke all on function public.admin_update_account(uuid,text,text,text,text,text,text,text,text,boolean,text,text,text,integer,text,text,text,text,text) from public, anon;
grant execute on function public.admin_update_account(uuid,text,text,text,text,text,text,text,text,boolean,text,text,text,integer,text,text,text,text,text) to authenticated;

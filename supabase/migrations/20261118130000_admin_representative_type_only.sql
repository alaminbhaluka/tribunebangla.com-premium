create or replace function public.admin_update_representative_type(
  p_user_id uuid,
  p_desired_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_user_id is null then raise exception 'User is required'; end if;
  if p_desired_role not in ('reporter','photographer','editor') then
    raise exception 'Invalid representative type';
  end if;

  select sa.id into application_id
  from public.staff_applications sa
  where sa.user_id = p_user_id
  order by sa.created_at desc
  limit 1
  for update;

  if application_id is null then
    raise exception 'No representative application exists for this account';
  end if;

  update public.staff_applications
  set desired_role = p_desired_role, updated_at = now()
  where id = application_id;
end;
$$;

revoke all on function public.admin_update_representative_type(uuid,text) from public;
grant execute on function public.admin_update_representative_type(uuid,text) to authenticated;

create or replace function private.get_admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text := (select auth.jwt())->'app_metadata'->>'role';
begin
  if auth.uid() is null or v_role not in ('super_admin','admin','editor','reporter_admin','auto_news_admin') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  return jsonb_build_object(
    'total_news', case when v_role in ('super_admin','admin','editor') then (select count(*) from public.news) else 0 end,
    'total_users', case when v_role in ('super_admin','admin') then (select count(*) from public.profiles) else 0 end,
    'active_reporters', case when v_role in ('super_admin','admin','reporter_admin') then (select count(*) from public.reporter_profiles where is_active=true) else 0 end,
    'pending_applications', case when v_role in ('super_admin','admin','reporter_admin') then (select count(*) from public.reporter_applications where status='pending') else 0 end,
    'pending_auto_news', case when v_role in ('super_admin','admin','auto_news_admin') then (select count(*) from public.auto_news_queue where status='pending') else 0 end,
    'published_auto_news', case when v_role in ('super_admin','admin','editor','auto_news_admin') then (select count(*) from public.news where source_type='auto') else 0 end,
    'published_videos', case when v_role in ('super_admin','admin','editor') then (select count(*) from public.video_posts where status='published') else 0 end,
    'published_epapers', case when v_role in ('super_admin','admin','editor') then (select count(*) from public.epapers where status='published') else 0 end
  );
end;
$$;
revoke all on function private.get_admin_dashboard_stats() from public,anon;
grant execute on function private.get_admin_dashboard_stats() to authenticated;

create or replace function public.get_admin_dashboard_stats()
returns jsonb
language sql
security invoker
set search_path=''
as $$ select private.get_admin_dashboard_stats() $$;
revoke all on function public.get_admin_dashboard_stats() from public,anon;
grant execute on function public.get_admin_dashboard_stats() to authenticated;

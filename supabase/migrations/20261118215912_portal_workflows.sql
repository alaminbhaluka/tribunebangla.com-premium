-- TribuneBangla Premium: portal workflow extensions
-- Initial schema migration is already applied as initial_news_portal_schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.profiles(id,display_name,phone,account_type)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),nullif(new.phone,''),split_part(coalesce(new.email,''),'@',1),'পাঠক'),nullif(new.phone,''),'reader')
  on conflict(id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function private.handle_new_user();

create index if not exists news_category_status_published_idx on public.news(category_id,status,published_at desc);
create index if not exists news_author_status_idx on public.news(author_id,status,updated_at desc);
create index if not exists applications_user_created_idx on public.reporter_applications(user_id,created_at desc);
create index if not exists applications_status_created_idx on public.reporter_applications(status,created_at desc);
create index if not exists reporter_profiles_area_idx on public.reporter_profiles(assigned_area);
create index if not exists auto_queue_status_created_idx on public.auto_news_queue(status,created_at desc);
create index if not exists auto_queue_category_idx on public.auto_news_queue(category_id);
create index if not exists audit_actor_created_idx on public.admin_audit_logs(actor_id,created_at desc);
create index if not exists settings_updated_by_idx on public.site_settings(updated_by);
create index if not exists auto_news_queue_news_id_idx on public.auto_news_queue(news_id);
create index if not exists auto_news_queue_reviewed_by_idx on public.auto_news_queue(reviewed_by);
create index if not exists reporter_applications_reviewed_by_idx on public.reporter_applications(reviewed_by);
create index if not exists reporter_profiles_approved_by_idx on public.reporter_profiles(approved_by);
drop index if exists public.auto_queue_status_idx;
drop index if exists public.applications_user_idx;

insert into public.categories(name,slug,sort_order,is_active) values
('জাতীয়','national',1,true),('রাজনীতি','politics',2,true),('আন্তর্জাতিক','international',3,true),
('সারাদেশ','country',4,true),('অর্থনীতি','economy',5,true),('খেলাধুলা','sports',6,true),
('বিনোদন','entertainment',7,true),('শিক্ষা','education',8,true),('প্রযুক্তি','technology',9,true),
('স্বাস্থ্য','health',10,true),('মতামত','opinion',11,true),('ভিডিও','video',12,true)
on conflict(slug) do nothing;

create or replace function private.approve_auto_news(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_actor uuid:=auth.uid(); v_role text:=(select auth.jwt())->'app_metadata'->>'role';
 v_item public.auto_news_queue%rowtype; v_news_id uuid; v_slug text;
begin
 if v_actor is null or v_role not in ('super_admin','admin','editor') then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into v_item from public.auto_news_queue where id=p_queue_id and status='pending' for update;
 if not found then raise exception 'Pending queue item not found' using errcode='P0002'; end if;
 v_slug:=trim(both '-' from regexp_replace(lower(coalesce(v_item.title,'')),'[^a-z0-9]+','-','g'));
 if v_slug='' then v_slug:='auto-news'; end if;
 v_slug:=left(v_slug,140)||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,8);
 insert into public.news(title,slug,excerpt,body,featured_image,category_id,author_id,status,source_type,source_name,source_url,published_at)
 values(v_item.title,v_slug,v_item.excerpt,coalesce(v_item.body,''),v_item.image_url,v_item.category_id,v_actor,'published','auto',v_item.source_name,v_item.source_url,now())
 returning id into v_news_id;
 update public.auto_news_queue set status='published',reviewed_by=v_actor,reviewed_at=now(),news_id=v_news_id where id=p_queue_id;
 insert into public.admin_audit_logs(actor_id,action,target_table,target_id,details)
 values(v_actor,'approve_and_publish_auto_news','auto_news_queue',p_queue_id::text,jsonb_build_object('news_id',v_news_id,'title',v_item.title));
 return v_news_id;
end;
$$;
revoke all on function private.approve_auto_news(uuid) from public,anon;
grant execute on function private.approve_auto_news(uuid) to authenticated;

create or replace function private.review_reporter_application(p_application_id uuid,p_status text,p_reporter_type text default null,p_designation text default null,p_assigned_area text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_role text:=(select auth.jwt())->'app_metadata'->>'role'; v_user_id uuid;
begin
 if v_actor is null or v_role not in ('super_admin','admin','reporter_admin') then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_status not in ('approved','rejected') then raise exception 'Invalid status' using errcode='22023'; end if;
 if p_status='approved' and coalesce(trim(p_reporter_type),'')='' then raise exception 'Reporter type required' using errcode='22023'; end if;
 select user_id into v_user_id from public.reporter_applications where id=p_application_id and status='pending' for update;
 if not found then raise exception 'Pending application not found' using errcode='P0002'; end if;
 update public.reporter_applications set status=p_status,reviewed_by=v_actor,reviewed_at=now() where id=p_application_id;
 if p_status='approved' then
  insert into public.reporter_profiles(user_id,reporter_type,designation,assigned_area,is_active,approved_by,approved_at)
  values(v_user_id,p_reporter_type,p_designation,p_assigned_area,true,v_actor,now())
  on conflict(user_id) do update set reporter_type=excluded.reporter_type,designation=excluded.designation,assigned_area=excluded.assigned_area,is_active=true,approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=now();
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role','reporter') where id=v_user_id;
 end if;
 insert into public.admin_audit_logs(actor_id,action,target_table,target_id,details)
 values(v_actor,'review_reporter_application','reporter_applications',p_application_id::text,jsonb_build_object('status',p_status,'reporter_type',p_reporter_type,'assigned_area',p_assigned_area));
end;
$$;
revoke all on function private.review_reporter_application(uuid,text,text,text,text) from public,anon;
grant execute on function private.review_reporter_application(uuid,text,text,text,text) to authenticated;

create or replace function private.list_user_access()
returns table(user_id uuid,email text,role text,created_at timestamptz)
language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or (select auth.jwt())->'app_metadata'->>'role'<>'super_admin' then raise exception 'Only primary administrator' using errcode='42501'; end if;
 return query select u.id,u.email::text,coalesce(u.raw_app_meta_data->>'role','reader'),u.created_at from auth.users u order by u.created_at desc;
end;
$$;
revoke all on function private.list_user_access() from public,anon;
grant execute on function private.list_user_access() to authenticated;

create or replace function private.set_user_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_target_role text;
begin
 if v_actor is null or (select auth.jwt())->'app_metadata'->>'role'<>'super_admin' then raise exception 'Only primary administrator' using errcode='42501'; end if;
 if p_role not in ('reader','reporter','admin','editor','reporter_admin','auto_news_admin') then raise exception 'Invalid role' using errcode='22023'; end if;
 select raw_app_meta_data->>'role' into v_target_role from auth.users where id=p_user_id for update;
 if not found then raise exception 'Account not found' using errcode='P0002'; end if;
 if v_target_role='super_admin' then raise exception 'Primary admin role is immutable here' using errcode='42501'; end if;
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',p_role) where id=p_user_id;
 insert into public.admin_audit_logs(actor_id,action,target_table,target_id,details) values(v_actor,'change_user_role','auth.users',p_user_id::text,jsonb_build_object('new_role',p_role));
end;
$$;
revoke all on function private.set_user_role(uuid,text) from public,anon;
grant execute on function private.set_user_role(uuid,text) to authenticated;

create or replace function public.approve_auto_news(p_queue_id uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.approve_auto_news(p_queue_id) $$;
revoke all on function public.approve_auto_news(uuid) from public,anon;
grant execute on function public.approve_auto_news(uuid) to authenticated;
create or replace function public.review_reporter_application(p_application_id uuid,p_status text,p_reporter_type text default null,p_designation text default null,p_assigned_area text default null)
returns void language sql security invoker set search_path='' as $$ select private.review_reporter_application(p_application_id,p_status,p_reporter_type,p_designation,p_assigned_area) $$;
revoke all on function public.review_reporter_application(uuid,text,text,text,text) from public,anon;
grant execute on function public.review_reporter_application(uuid,text,text,text,text) to authenticated;
create or replace function public.list_user_access()
returns table(user_id uuid,email text,role text,created_at timestamptz) language sql security invoker set search_path='' as $$ select * from private.list_user_access() $$;
revoke all on function public.list_user_access() from public,anon;
grant execute on function public.list_user_access() to authenticated;
create or replace function public.set_user_role(p_user_id uuid,p_role text)
returns void language sql security invoker set search_path='' as $$ select private.set_user_role(p_user_id,p_role) $$;
revoke all on function public.set_user_role(uuid,text) from public,anon;
grant execute on function public.set_user_role(uuid,text) to authenticated;

drop policy if exists auto_queue_admin_update on public.auto_news_queue;
create policy auto_queue_admin_update on public.auto_news_queue for update to authenticated
using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','auto_news_admin') and status='pending')
with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','auto_news_admin') and status='pending');

drop policy if exists news_admin_delete on public.news;
create policy news_admin_delete on public.news for delete to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
drop policy if exists news_staff_insert_draft on public.news;
create policy news_staff_insert_draft on public.news for insert to authenticated
with check (author_id=(select auth.uid()) and status in ('draft','pending') and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor','reporter'));
drop policy if exists news_staff_update on public.news;
create policy news_staff_update on public.news for update to authenticated
using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor') or (author_id=(select auth.uid()) and status in ('draft','pending','rejected')))
with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor') or (author_id=(select auth.uid()) and status in ('draft','pending')));
drop policy if exists news_public_published on public.news;
create policy news_public_published on public.news for select to anon using (status='published' and published_at is not null and published_at<=now());
drop policy if exists news_staff_view_all on public.news;
create policy news_staff_view_all on public.news for select to authenticated
using ((status='published' and published_at is not null and published_at<=now()) or (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor','auto_news_admin') or author_id=(select auth.uid()));

drop policy if exists categories_admin_manage on public.categories;
drop policy if exists categories_public_active on public.categories;
create policy categories_public_active on public.categories for select to anon,authenticated using (is_active=true or (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
drop policy if exists categories_admin_insert on public.categories;
create policy categories_admin_insert on public.categories for insert to authenticated with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
drop policy if exists categories_admin_update on public.categories;
create policy categories_admin_update on public.categories for update to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin')) with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
drop policy if exists categories_admin_delete on public.categories;
create policy categories_admin_delete on public.categories for delete to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));

drop policy if exists applications_admin_update on public.reporter_applications;
create policy applications_admin_update on public.reporter_applications for update to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','reporter_admin')) with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','reporter_admin'));
drop policy if exists applications_select_owner_or_admin on public.reporter_applications;
create policy applications_select_owner_or_admin on public.reporter_applications for select to authenticated using (user_id=(select auth.uid()) or (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','reporter_admin'));

drop policy if exists reporter_profiles_admin_manage on public.reporter_profiles;
drop policy if exists reporter_profiles_self_or_admin_read on public.reporter_profiles;
create policy reporter_profiles_self_or_admin_read on public.reporter_profiles for select to authenticated using (user_id=(select auth.uid()) or (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','reporter_admin'));
drop policy if exists reporter_profiles_admin_insert on public.reporter_profiles;
create policy reporter_profiles_admin_insert on public.reporter_profiles for insert to authenticated with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','reporter_admin'));
drop policy if exists reporter_profiles_admin_update on public.reporter_profiles;
create policy reporter_profiles_admin_update on public.reporter_profiles for update to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','reporter_admin')) with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','reporter_admin'));
drop policy if exists reporter_profiles_admin_delete on public.reporter_profiles;
create policy reporter_profiles_admin_delete on public.reporter_profiles for delete to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','reporter_admin'));

drop policy if exists auto_queue_admin_delete on public.auto_news_queue;
create policy auto_queue_admin_delete on public.auto_news_queue for delete to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
drop policy if exists auto_queue_admin_insert on public.auto_news_queue;
create policy auto_queue_admin_insert on public.auto_news_queue for insert to authenticated with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','auto_news_admin') and status='pending');
drop policy if exists auto_queue_admin_read on public.auto_news_queue;
create policy auto_queue_admin_read on public.auto_news_queue for select to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','auto_news_admin'));
drop policy if exists audit_admin_read on public.admin_audit_logs;
create policy audit_admin_read on public.admin_audit_logs for select to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));

drop policy if exists settings_admin_manage on public.site_settings;
drop policy if exists settings_public_read on public.site_settings;
create policy settings_public_read on public.site_settings for select to anon,authenticated using (key in ('site_name','site_tagline','logo_url','favicon_url','social_links') or (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
drop policy if exists settings_admin_insert on public.site_settings;
create policy settings_admin_insert on public.site_settings for insert to authenticated with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
drop policy if exists settings_admin_update on public.site_settings;
create policy settings_admin_update on public.site_settings for update to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin')) with check ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
drop policy if exists settings_admin_delete on public.site_settings;
create policy settings_admin_delete on public.site_settings for delete to authenticated using ((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('news-media','news-media',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists news_media_public_read on storage.objects;
create policy news_media_public_read on storage.objects for select to anon,authenticated using (bucket_id='news-media');
drop policy if exists news_media_editor_upload on storage.objects;
create policy news_media_editor_upload on storage.objects for insert to authenticated with check (bucket_id='news-media' and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
drop policy if exists news_media_editor_update on storage.objects;
create policy news_media_editor_update on storage.objects for update to authenticated using (bucket_id='news-media' and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor')) with check (bucket_id='news-media' and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
drop policy if exists news_media_admin_delete on storage.objects;
create policy news_media_admin_delete on storage.objects for delete to authenticated using (bucket_id='news-media' and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));


-- Public reporter profile exposes only approved professional fields, never address or phone.
create or replace function private.get_reporter_profile(p_user_id uuid)
returns table(display_name text,reporter_type text,designation text,assigned_area text)
language sql security definer set search_path=''
as $$
 select p.display_name::text,rp.reporter_type,rp.designation,rp.assigned_area
 from public.reporter_profiles rp join public.profiles p on p.id=rp.user_id
 where rp.user_id=p_user_id and rp.is_active=true limit 1
$$;
revoke all on function private.get_reporter_profile(uuid) from public;
grant usage on schema private to anon;
grant execute on function private.get_reporter_profile(uuid) to anon,authenticated;
create or replace function public.get_reporter_profile(p_user_id uuid)
returns table(display_name text,reporter_type text,designation text,assigned_area text)
language sql security invoker set search_path=''
as $$ select * from private.get_reporter_profile(p_user_id) $$;
revoke all on function public.get_reporter_profile(uuid) from public;
grant execute on function public.get_reporter_profile(uuid) to anon,authenticated;

-- Keep reader personal fields protected from all authenticated users except self-editable display name/avatar.
revoke update on table public.profiles from public,anon,authenticated;
grant update(display_name,avatar_url) on table public.profiles to authenticated;

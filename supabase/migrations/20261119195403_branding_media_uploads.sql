-- Super-admin branding uploads: preserve existing news-media permissions and allow GIF assets.
create table if not exists public.site_design_settings(
 key text primary key,
 value jsonb not null default '{}'::jsonb,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.site_design_settings enable row level security;
grant select on public.site_design_settings to anon,authenticated;
grant insert,update,delete on public.site_design_settings to authenticated;
drop policy if exists site_design_public_read on public.site_design_settings;
create policy site_design_public_read on public.site_design_settings
 for select to anon,authenticated using (true);
drop policy if exists site_design_super_admin_insert on public.site_design_settings;
create policy site_design_super_admin_insert on public.site_design_settings
 for insert to authenticated with check ((select auth.jwt())->'app_metadata'->>'role'='super_admin');
drop policy if exists site_design_super_admin_update on public.site_design_settings;
create policy site_design_super_admin_update on public.site_design_settings
 for update to authenticated using ((select auth.jwt())->'app_metadata'->>'role'='super_admin')
 with check ((select auth.jwt())->'app_metadata'->>'role'='super_admin');
drop policy if exists site_design_super_admin_delete on public.site_design_settings;
create policy site_design_super_admin_delete on public.site_design_settings
 for delete to authenticated using ((select auth.jwt())->'app_metadata'->>'role'='super_admin');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('news-media','news-media',true,5242880,array['image/jpeg','image/png','image/webp','image/avif','image/gif'])
on conflict(id) do update set public=true,file_size_limit=5242880,
 allowed_mime_types=excluded.allowed_mime_types;

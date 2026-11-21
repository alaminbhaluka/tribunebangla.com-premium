-- Video and e-paper publication modules.
create table if not exists public.video_posts(
 id uuid primary key default gen_random_uuid(),title text not null,slug text not null unique,
 description text,video_url text not null,thumbnail_url text,
 category_id uuid references public.categories(id) on delete set null,
 status text not null default 'draft' check(status in ('draft','pending','published','archived')),
 author_id uuid references auth.users(id) on delete set null,published_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.epapers(
 id uuid primary key default gen_random_uuid(),title text not null,edition_date date not null,
 pdf_url text not null,cover_url text,
 status text not null default 'draft' check(status in ('draft','published','archived')),
 created_by uuid references auth.users(id) on delete set null,published_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.video_posts enable row level security;
alter table public.epapers enable row level security;
grant select on public.video_posts,public.epapers to anon,authenticated;
grant insert,update,delete on public.video_posts,public.epapers to authenticated;
create policy video_public_read on public.video_posts for select to anon using(status='published' and published_at is not null and published_at<=now());
create policy video_staff_read on public.video_posts for select to authenticated using((status='published' and published_at is not null and published_at<=now()) or (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
create policy video_staff_insert on public.video_posts for insert to authenticated with check(author_id=(select auth.uid()) and status in ('draft','pending') and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
create policy video_staff_update on public.video_posts for update to authenticated using((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor')) with check((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
create policy video_admin_delete on public.video_posts for delete to authenticated using((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
create policy epaper_public_read on public.epapers for select to anon using(status='published' and published_at is not null and published_at<=now());
create policy epaper_staff_read on public.epapers for select to authenticated using((status='published' and published_at is not null and published_at<=now()) or (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
create policy epaper_staff_insert on public.epapers for insert to authenticated with check(created_by=(select auth.uid()) and status in ('draft','published') and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
create policy epaper_staff_update on public.epapers for update to authenticated using((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor')) with check((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
create policy epaper_admin_delete on public.epapers for delete to authenticated using((select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));
create index if not exists video_posts_status_published_idx on public.video_posts(status,published_at desc);
create index if not exists epapers_status_edition_idx on public.epapers(status,edition_date desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('epaper-pdfs','epaper-pdfs',true,26214400,array['application/pdf']) on conflict(id) do update set public=true,file_size_limit=26214400,allowed_mime_types=excluded.allowed_mime_types;
create policy epaper_pdf_public_read on storage.objects for select to anon,authenticated using(bucket_id='epaper-pdfs');
create policy epaper_pdf_editor_upload on storage.objects for insert to authenticated with check(bucket_id='epaper-pdfs' and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
create policy epaper_pdf_editor_update on storage.objects for update to authenticated using(bucket_id='epaper-pdfs' and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor')) with check(bucket_id='epaper-pdfs' and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor'));
create policy epaper_pdf_admin_delete on storage.objects for delete to authenticated using(bucket_id='epaper-pdfs' and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin'));

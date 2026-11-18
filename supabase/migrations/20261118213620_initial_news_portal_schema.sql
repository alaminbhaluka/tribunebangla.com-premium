-- TribuneBangla Premium initial database schema.
-- Project ref: tdyrxdnqyuebtzhjuprh
create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null,
 phone text unique,
 address text,
 avatar_url text,
 account_type text not null default 'reader' check(account_type in ('reader','reporter')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.categories(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 slug text not null unique,
 description text,
 sort_order integer not null default 0,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.news(
 id uuid primary key default gen_random_uuid(),
 title text not null,
 slug text not null unique,
 excerpt text,
 body text not null default '',
 featured_image text,
 image_alt text,
 category_id uuid references public.categories(id) on delete set null,
 author_id uuid references auth.users(id) on delete set null,
 status text not null default 'draft' check(status in ('draft','pending','scheduled','published','archived','rejected')),
 source_type text not null default 'manual' check(source_type in ('manual','auto')),
 source_name text,
 source_url text,
 scheduled_at timestamptz,
 published_at timestamptz,
 view_count bigint not null default 0 check(view_count>=0),
 seo_title text,
 seo_description text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.reporter_applications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 requested_type text not null,
 area text not null,
 experience text,
 message text,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.reporter_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 reporter_type text not null,
 designation text,
 assigned_area text,
 is_active boolean not null default true,
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.auto_news_queue(
 id uuid primary key default gen_random_uuid(),
 source_name text not null,
 source_url text not null unique,
 external_id text,
 title text not null,
 excerpt text,
 body text,
 image_url text,
 category_id uuid references public.categories(id) on delete set null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','published')),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 news_id uuid references public.news(id) on delete set null,
 created_at timestamptz not null default now()
);
create table if not exists public.admin_audit_logs(
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 action text not null,
 target_table text not null,
 target_id text,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.site_settings(
 key text primary key,
 value jsonb not null default '{}'::jsonb,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.news enable row level security;
alter table public.reporter_applications enable row level security;
alter table public.reporter_profiles enable row level security;
alter table public.auto_news_queue enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.site_settings enable row level security;

grant usage on schema public to anon,authenticated;
grant select on public.categories,public.news,public.site_settings to anon,authenticated;
grant select,insert on public.profiles to authenticated;
revoke update on public.profiles from public,anon,authenticated;
grant update(display_name,avatar_url) on public.profiles to authenticated;
grant select,insert,update on public.reporter_applications to authenticated;
grant select,insert,update,delete on public.reporter_profiles to authenticated;
grant select,insert,update,delete on public.auto_news_queue to authenticated;
grant select on public.admin_audit_logs to authenticated;
grant insert,update,delete on public.categories,public.news,public.site_settings to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_insert_self_reader on public.profiles for insert to authenticated with check ((select auth.uid())=id and account_type='reader');
create policy profiles_update_self on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);

create policy categories_public_active on public.categories for select to anon,authenticated using (is_active=true);
create policy categories_admin_manage on public.categories for all to authenticated using ((auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin')) with check ((auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin'));

create policy news_public_published on public.news for select to anon,authenticated using (status='published' and published_at is not null and published_at<=now());
create policy news_staff_view_all on public.news for select to authenticated using (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','editor','auto_news_admin') or author_id=(select auth.uid())
);
create policy news_staff_insert_draft on public.news for insert to authenticated with check (
 author_id=(select auth.uid()) and status in ('draft','pending') and
 ((auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','editor') or (auth.jwt()->'app_metadata'->>'role')='reporter')
);
create policy news_staff_update on public.news for update to authenticated using (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','editor') or
 (author_id=(select auth.uid()) and status in ('draft','pending','rejected'))
) with check (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','editor') or
 (author_id=(select auth.uid()) and status in ('draft','pending'))
);
create policy news_admin_delete on public.news for delete to authenticated using ((auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin'));

create policy applications_insert_self on public.reporter_applications for insert to authenticated with check ((select auth.uid())=user_id and status='pending');
create policy applications_select_owner_or_admin on public.reporter_applications for select to authenticated using (
 (select auth.uid())=user_id or (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','reporter_admin')
);
create policy applications_admin_update on public.reporter_applications for update to authenticated using (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','reporter_admin')
) with check ((auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','reporter_admin'));

create policy reporter_profiles_self_or_admin_read on public.reporter_profiles for select to authenticated using (
 (select auth.uid())=user_id or (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','reporter_admin')
);
create policy reporter_profiles_admin_manage on public.reporter_profiles for all to authenticated using (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','reporter_admin')
) with check ((auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','reporter_admin'));

create policy auto_queue_admin_read on public.auto_news_queue for select to authenticated using (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','auto_news_admin')
);
create policy auto_queue_admin_insert on public.auto_news_queue for insert to authenticated with check (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','auto_news_admin') and status='pending'
);
create policy auto_queue_admin_update on public.auto_news_queue for update to authenticated using (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','auto_news_admin')
) with check ((auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin','auto_news_admin'));
create policy auto_queue_admin_delete on public.auto_news_queue for delete to authenticated using (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin')
);

create policy audit_admin_read on public.admin_audit_logs for select to authenticated using (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin')
);
create policy settings_public_read on public.site_settings for select to anon,authenticated using (
 key in ('site_name','site_tagline','logo_url','favicon_url','social_links')
);
create policy settings_admin_manage on public.site_settings for all to authenticated using (
 (auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin')
) with check ((auth.jwt()->'app_metadata'->>'role') in ('super_admin','admin'));

create index if not exists news_status_published_idx on public.news(status,published_at desc);
create index if not exists news_category_idx on public.news(category_id);
create index if not exists news_author_idx on public.news(author_id);
create index if not exists applications_user_idx on public.reporter_applications(user_id);
create index if not exists auto_queue_status_idx on public.auto_news_queue(status,created_at desc);
create index if not exists audit_created_idx on public.admin_audit_logs(created_at desc);

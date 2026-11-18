create table if not exists public.saved_news (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  news_id uuid not null references public.news(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_news_user_news_unique unique(user_id,news_id)
);
create index if not exists saved_news_user_created_idx on public.saved_news(user_id,created_at desc);
alter table public.saved_news enable row level security;
drop policy if exists saved_news_owner_select on public.saved_news;
create policy saved_news_owner_select on public.saved_news
for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists saved_news_owner_insert on public.saved_news;
create policy saved_news_owner_insert on public.saved_news
for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists saved_news_owner_delete on public.saved_news;
create policy saved_news_owner_delete on public.saved_news
for delete to authenticated using (user_id=(select auth.uid()));
grant select,insert,delete on public.saved_news to authenticated;

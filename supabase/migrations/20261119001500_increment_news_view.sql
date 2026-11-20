create or replace function private.increment_news_view(p_news_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.news
  set view_count=coalesce(view_count,0)+1
  where id=p_news_id
    and status='published'
    and published_at is not null
    and published_at<=now();
end;
$$;
revoke all on function private.increment_news_view(uuid) from public;
grant execute on function private.increment_news_view(uuid) to anon,authenticated;

create or replace function public.increment_news_view(p_news_id uuid)
returns void
language sql
security invoker
set search_path=''
as $$ select private.increment_news_view(p_news_id) $$;
revoke all on function public.increment_news_view(uuid) from public;
grant execute on function public.increment_news_view(uuid) to anon,authenticated;

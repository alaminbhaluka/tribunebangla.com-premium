-- Allow editorial staff to publish newly created news directly.
-- Reporters remain restricted to draft/pending submissions.
drop policy if exists news_staff_insert_draft on public.news;
create policy news_staff_insert_draft on public.news
for insert to authenticated
with check (
  author_id=(select auth.uid())
  and (
    (
      status in ('draft','pending')
      and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor','reporter')
    )
    or
    (
      status='published'
      and (select auth.jwt())->'app_metadata'->>'role' in ('super_admin','admin','editor')
    )
  )
);
create index if not exists video_posts_author_idx on public.video_posts(author_id);
create index if not exists video_posts_category_idx on public.video_posts(category_id);
create index if not exists epapers_created_by_idx on public.epapers(created_by);

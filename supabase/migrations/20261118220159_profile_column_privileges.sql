revoke update on table public.profiles from public,anon,authenticated;
grant update(display_name,avatar_url) on table public.profiles to authenticated;

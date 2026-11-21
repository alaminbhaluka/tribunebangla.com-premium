drop policy if exists "settings_public_read" on public.site_settings;
create policy "settings_public_read" on public.site_settings
for select to anon, authenticated
using (
  key = any (array['site_name','site_tagline','logo_url','favicon_url','social_links','breaking_text','contact_email'])
  or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('super_admin','admin')
);
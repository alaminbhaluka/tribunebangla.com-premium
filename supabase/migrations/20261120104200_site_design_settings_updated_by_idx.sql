-- Add an index for the nullable updater foreign key used by site design settings.
create index if not exists site_design_settings_updated_by_idx
  on public.site_design_settings (updated_by);

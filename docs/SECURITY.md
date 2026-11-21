# Security baseline

- Browser code uses only the project's publishable key; service-role/secret keys are never shipped to clients.
- RLS is enabled on all eight public tables.
- Authorization uses trusted `app_metadata`, never user-editable metadata.
- Private security-definer functions are kept in a non-exposed schema and verify the caller's JWT role.
- Public RPC wrappers are invoker functions with execute permission limited to authenticated users.
- Only the super-admin can enumerate accounts and assign delegated roles.
- Delegated administrators cannot alter reader personal name or address.
- Auto-news queue records remain pending; only the approval RPC creates and publishes a news record.
- Reporter approval and role assignment are performed together in a trusted database function.
- Privileged actions write audit entries.
- News-media uploads are limited to authenticated editorial roles and 5 MB image files.
- Enable Supabase leaked-password protection before preview release.

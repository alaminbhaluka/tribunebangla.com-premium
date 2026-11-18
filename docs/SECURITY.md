# Security baseline

- Client code may use only a Supabase publishable key; never a service-role or secret key.
- Authorization must be enforced by database policies and trusted server handlers.
- Reader personal profile fields are not editable by delegated administrators.
- Only the primary administrator can grant/revoke administrator roles or alter the primary-admin designation.
- Delegated administrators receive scoped permissions; privileged changes are auditable.
- Auto-news ingestion creates pending records only; publication requires authorized human approval.
- All exposed public-schema tables require reviewed RLS policies.
- Authentication, recovery, session expiry and account suspension must be tested before public launch.

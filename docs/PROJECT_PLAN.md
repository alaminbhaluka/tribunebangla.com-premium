# TribuneBangla Premium — project plan

## Boundaries
- Repository: `alaminbhaluka/tribunebangla.com-premium`
- Development branch: `development/full-portal-foundation`
- Preview hostname target: `preview.tribunebangla.com`
- Production repository and production domain remain untouched.
- No production deployment or domain cutover before full QA and explicit owner approval.

## Approved decisions
- Separate preview deployment first; no production publish until approval.
- Automatically collected stories remain pending until authorized human approval.
- One primary administrator plus delegated admins with least-privilege roles.
- Reader signup/login uses Bangladesh mobile number and password without SMS OTP.
- Delegated admins may manage reporter type/designation, but must not edit reader personal name/address.
- Free Supabase plan only; do not upgrade or enable paid services without explicit approval.

## Implemented
- [x] Isolated GitHub repository and development branch.
- [x] Responsive portal shell and all 18 route families.
- [x] Supabase project, 8 initial RLS-enabled tables, and super-admin account.
- [x] Public news, category and article queries.
- [x] Reader phone/password auth UI; confirmation setting still needs dashboard configuration.
- [x] Reporter application and approval RPC.
- [x] News draft/pending submission and editor publication UI.
- [x] Category administration and protected profile column privileges.
- [x] Server-rendered Open Graph/Twitter metadata route for article links.
- [x] Pending-only auto-news queue, secret-protected ingestion endpoint source and server-side human approval RPC.
- [x] Super-admin account listing and delegated role change RPC.
- [x] News media bucket and role-scoped storage policies.
- [x] Audit logging for privileged role and approval actions.
- [x] CI workflow and smoke tests added; latest development-branch run passed.
- [x] Source-controlled initial and follow-up database migrations match the applied Supabase migration history.

## Remaining before preview signoff
1. Disable Phone confirmations in Supabase Auth to meet no-OTP signup; enable leaked-password protection.
2. Verify the migration and all policies on a clean staging database.
3. Configure ingestion secrets, deploy the pending-only ingestion function, and select RSS/news sources plus a schedule.\n4. Configure the preview deployment and DNS; neither is currently verified.
5. Verify server-rendered Open Graph metadata on the deployed preview URL.
5. Add secure account invitation flow and test role revocation/session refresh.
6. Complete end-to-end tests for reader, reporter, editor, auto-news admin and super-admin.
7. Accessibility, responsive-device, backup/restore and rollback checks.

## Release gates
- Never expose a service-role or secret key in browser code.
- All exposed tables have deliberate RLS policies.
- Authorization is enforced in the database, not only by hiding UI controls.
- Auto-news never publishes without a human approval action.
- Production remains untouched until tests pass and the owner approves.

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
- [x] Public news, category and article queries with the premium lead-story homepage layout.
- [x] Reader saved-news library with owner-only RLS and save/remove actions.
- [x] Reader/reporter notification center with automatic application and article-status alerts.
- [x] Role-scoped admin dashboard statistics through a security-definer RPC.
- [x] Bengali article social-preview slug handling and Vercel preview canonical URL support.
- [x] Reader phone/password auth UI; confirmation setting still needs dashboard configuration.
- [x] Reporter application and approval RPC.
- [x] Unique five-digit reporter ID generation and public professional profile display.
- [x] Pending auto-news editing/deletion and published auto-news count in admin dashboard.
- [x] Site wordmark/favicon URL customization.
- [x] News draft/pending submission and editor publication UI.
- [x] Category administration and protected profile column privileges.
- [x] Video and e-paper data modules, editor publishing screens and PDF storage.
- [x] Server-rendered Open Graph/Twitter metadata route for article links.
- [x] Pending-only auto-news queue, secret-protected ingestion endpoint source and server-side human approval RPC.
- [x] Super-admin account listing and delegated role change RPC.
- [x] News media bucket and role-scoped storage policies.
- [x] Audit logging for privileged role and approval actions.
- [x] CI workflow and smoke tests added; latest development-branch run passed.
- [x] Source-controlled initial and follow-up database migrations match the applied Supabase migration history.

## Remaining before preview signoff
1. **Manual Supabase Auth settings:** disable Phone confirmations for the approved OTP-free phone/password signup and enable leaked-password protection. The connected Supabase API does not expose these Auth dashboard toggles.
2. **Auto-news secrets:** set `AUTO_NEWS_SHARED_SECRET` in Supabase Edge Function secrets, and matching sensitive Preview variables `AUTO_NEWS_SHARED_SECRET` and `CRON_SECRET` in Vercel. The current Vercel Preview environment has no variables configured, so the daily RSS Cron cannot run yet.
3. **Secure account invitation:** add an owner-controlled invite workflow before delegating privileged roles to new accounts.
4. **End-to-end verification:** test reader, reporter, editor, auto-news admin and super-admin sessions against real browser flows.
5. **Preview domain and SEO:** configure/verify `preview.tribunebangla.com`, confirm social metadata and canonical URLs, and add sitemap/robots validation.
6. **Release readiness:** accessibility, responsive-device, backup/restore and rollback checks.

<!-- Previously tracked tasks below are retained for historical context. -->
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

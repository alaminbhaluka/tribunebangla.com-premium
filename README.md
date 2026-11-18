# TribuneBangla Premium

Isolated development project for the approved 18-page Tribune Bangla redesign.

- Repository: `alaminbhaluka/tribunebangla.com-premium`
- Development branch: `development/full-portal-foundation`
- Separate Supabase project: `tribunebangla-premium`
- Preview hostname target: `preview.tribunebangla.com`
- Production repository and production domain remain untouched.

## Implemented in this branch
- Responsive Bengali news portal shell and 18 page families.
- Supabase client configuration using a publishable key only.
- Phone + password signup/login UI (OTP-free signup requires Phone confirmations disabled in Supabase Auth settings).
- Public published-news listing, category pages, article pages and search.
- Reader profile and reporter application form.
- Reporter dashboard and draft/pending article submission.
- Admin news editing, role-aware deletion, editor publication controls.
- Pending auto-news review and a server-side approval-and-publish RPC.
- Reporter application review and role assignment.
- Super-admin-only account role listing and delegated-role changes.
- Public news-media storage bucket with restricted editor upload policies.
- Audit records for privileged auto-news, reporter review and role changes.
- CI smoke tests and security headers.

## Run checks
```sh
npm run check
npm test
```

## Important release gates
- Configure Supabase Auth Phone provider with phone confirmations disabled to meet the approved no-OTP flow.
- Enable leaked-password protection in Supabase Auth security settings.
- Set the preview deployment environment and verify `preview.tribunebangla.com`.
- Verify Open Graph metadata from server-rendered responses for social link previews.
- Run end-to-end tests with the real super-admin session, reader, reporter and delegated admin roles.
- Configure a secure server-side invite workflow before delegating admin roles to newly created accounts.
- Do not deploy to production until all gates pass and the owner explicitly approves.

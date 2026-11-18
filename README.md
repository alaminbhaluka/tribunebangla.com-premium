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
- Public published-news listing, category pages, article pages, video and e-paper sections, and search.
- Reader profile and reporter application form.
- Reporter dashboard and draft/pending article submission.
- Admin news editing, category CRUD, video/e-paper publishing, role-aware deletion and editor publication controls.
- Secret-protected auto-news ingestion endpoint that can only enqueue pending items, plus review and server-side approval-and-publish RPC.
- Reporter application review and role assignment.
- Super-admin-only account role listing and delegated-role changes.
- Public news-media storage bucket with restricted editor upload policies.
- Server-rendered Open Graph and Twitter metadata for article links.
- Audit records for privileged auto-news, reporter review and role changes.
- CI smoke tests and security headers.

## Auto-news ingestion deployment\n\nThe Edge Function source is in `supabase/functions/ingest-news/index.ts`. Before deploying it, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a strong `AUTO_NEWS_SHARED_SECRET` as Supabase function secrets. Connect an RSS provider or scheduled fetcher to POST validated items with the `x-ingest-secret` header. This function only queues pending stories; it cannot publish them. No function has been deployed yet.\n\n## Run checks
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

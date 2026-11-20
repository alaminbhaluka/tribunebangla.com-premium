# TribuneBangla.com — Premium News Portal

This repository contains the isolated premium Tribune Bangla news portal implementation and its 18-page visual design preview. It is developed on a separate branch and Vercel Preview deployment; the existing production domain and deployment are not changed by these development commits.

- `index.html`, `app.js`, `styles.css` — public news portal and application UI.
- `login.html` — sign-in and registration entry.
- `preview/18-page-design-draft.html` — standalone 18-page visual design preview.
- `api/` — server-side social sharing and scheduled auto-news endpoints.
- `supabase/` — schema migrations and protected RSS ingestion Edge Function.

Isolated development project for the approved 18-page Tribune Bangla redesign.

- Repository: `alaminbhaluka/tribunebangla.com-premium`
- Development branch: `development/full-portal-foundation`
- Separate Supabase project: `tribunebangla-premium`
- Preview hostname target: `preview.tribunebangla.com`
- Production repository and production domain remain untouched.

## Implemented in this branch
- Responsive Bengali news portal shell and 18 page families.
- Supabase client configuration using a publishable key only.
- Phone + password signup/login UI with OTP-free phone confirmation; email signup may require email confirmation.
- Araler Khobor reference-matched Tribune Bangla homepage with a red trending-news band, lead-story layout, country/latest/popular sidebar, related-story article layout, and category navigation, public published-news listing, category pages, article pages, video and e-paper sections, and search.
- Reader profile, private saved-news library with save/remove actions, notification center for reporter-application and article-publication updates, and reporter application form.
- Reporter dashboard and draft/pending article submission.
- Admin news editing, category CRUD, video/e-paper publishing, role-aware deletion and editor publication controls.
- Secret-protected auto-news ingestion endpoint that can only enqueue pending items, plus review and server-side approval-and-publish RPC.
- Reporter application review, role assignment, and unique five-digit reporter IDs
- Admin editing/deletion for pending auto-news queue items; published auto-news remains in the unified news list
- Site branding settings for wordmark and favicon URLs.
- Super-admin-only account role listing, delegated-role changes, and secure email-based staff invitations with server-assigned app roles.
- Public news-media storage bucket with restricted editor upload policies.
- Server-rendered Open Graph and Twitter metadata for article links, including Bengali-slug support and Vercel preview canonical URLs; public article view counts power popular-news sections.
- Audit records for privileged auto-news, reporter review and role changes.
- CI smoke tests and security headers.

## Auto-news ingestion deployment

The Edge Function source is in `supabase/functions/ingest-news/index.ts`. Before deploying it, set a strong `AUTO_NEWS_SHARED_SECRET` in Supabase Edge Function secrets. Supabase provides `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` at runtime by default; the function reads the modern secret key and falls back to the legacy service-role variable. Never commit or share either key. Connect an RSS provider or scheduled fetcher to POST validated items with the `x-ingest-secret` header. This function only queues pending stories; it cannot publish them. The `ingest-news` Edge Function is deployed. Its shared secret and the Vercel cron secrets still need to be configured before scheduled RSS collection can run.

## Run checks
```sh
npm run check
npm test
```

## Important release gates
- Enable leaked-password protection in Supabase Auth security settings.
- Set the preview deployment environment and verify `preview.tribunebangla.com`.
- Verify Open Graph metadata from server-rendered responses for social link previews.
- Run end-to-end tests with the real super-admin session, reader, reporter and delegated admin roles.
- Verify invitation emails, allowed redirect URLs, and assigned staff roles end-to-end before onboarding real staff.
- Do not deploy to production until all gates pass and the owner explicitly approves.


## Auto-news RSS setup

- Super-admins can manage up to 20 RSS/Atom feeds in **Admin → Site Settings & RSS Sources**. Use one line per feed: `Publisher Name | https://publisher.example/rss.xml`.
- RSS entries are inserted into `auto_news_queue` as `pending`; the system never publishes automatically.
- The deployed `ingest-news` Edge Function checks `AUTO_NEWS_SHARED_SECRET` on every request.
- Configure the same strong random value as an Edge Function secret named `AUTO_NEWS_SHARED_SECRET` in Supabase and as a sensitive Preview environment variable in Vercel. Configure `CRON_SECRET` as a sensitive Preview environment variable in Vercel. Do not put either value in Git or browser config.
- Vercel Cron calls `/api/auto-news` daily at 02:00 UTC (08:00 Bangladesh time, within the scheduled hour on Hobby). Deploy a new Preview after setting the variables.
- You can manually test the endpoint from the Vercel deployment using an authorized cron invocation; do not share the secrets in chat.

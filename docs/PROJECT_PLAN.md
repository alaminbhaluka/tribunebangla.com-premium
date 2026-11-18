# TribuneBangla Premium — project plan

## Boundaries
- Repository: `alaminbhaluka/tribunebangla.com-premium`
- Development branch: `development/full-portal-foundation`
- Preview hostname target: `preview.tribunebangla.com`
- Production repository and production domain remain untouched.
- No production deployment or domain cutover before full QA and explicit owner approval.

## Approved decisions
- Use a separate preview deployment first.
- Automatically collected stories enter a review queue; an authorized editor must approve before publication.
- One primary administrator and multiple delegated administrators with least-privilege roles.
- Reader login uses Bangladesh mobile number and password; SMS OTP is not required.
- Delegated administrators may manage representative type/designation, but may not arbitrarily edit readers' personal name or address.

## Delivery phases
1. Responsive implementation of the approved 18-page design.
2. Data model, authentication, profiles and representative applications.
3. Editorial CMS: drafts, review, scheduling, publishing, revisions and media.
4. Role-based admin console and auditable administrator actions.
5. Auto-news ingestion into moderation queue (never direct publish).
6. Preview deployment, end-to-end tests, accessibility, security and performance.
7. Owner sign-off, backup/rollback plan and separately approved production cutover.

## The 18 page families
Home; category; article detail; search; reporter profile; login; reader registration; reader dashboard; reporter dashboard; admin dashboard; news management; representative management; video news; e-paper; contact; about; privacy policy; not found.

## Foundation status
- [x] Isolated development branch created.
- [x] Responsive shell and route resolver added.
- [x] All 18 page families represented.
- [x] Safe empty states; no fabricated published news or account data.
- [x] Baseline security headers and environment guardrails added.
- [ ] Supabase project/credentials confirmed for isolated environment.
- [ ] Database schema and row-level security designed and tested.
- [ ] Authentication, editorial workflow, admin roles and media storage implemented.
- [ ] Preview domain connected and end-to-end QA completed.

## Release gates
- Never expose Supabase service-role/secret keys to browser code.
- Every exposed table must have deliberate RLS policies.
- Authorization is enforced server/database-side, not by hiding UI controls.
- Auto-news remains unpublished until explicit human editorial approval.
- No production deployment until critical flows pass and the owner approves.

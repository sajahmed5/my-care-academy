# My Care Academy — Go-Live Checklist & Runbook

## 0. Deploying

**Primary path — push to GitHub.** The Vercel project is connected to
`sajahmed5/my-care-academy` (Project → Settings → Git). Pushing to `main` builds and
promotes to production automatically; any other branch gets its own preview URL.

```bash
git push            # main -> production deploy, no further action needed
```

This is the route to prefer: it deploys a *commit*, so what is live always matches something
in git history.

**Secondary path — Vercel CLI.** For a throwaway preview without committing, or to ship when
GitHub is unavailable.

```bash
npm run deploy:preview   # private preview deploy, throwaway URL
npm run deploy           # production deploy
```

Caveat: the CLI uploads the **local working tree**, not a commit, so uncommitted or stale files
go live and production can drift from `main`. Check `git status` first. Because both routes are
live, a push *and* a `npm run deploy` will each produce a deployment — prefer git for anything
that should stick.

Before any production deploy: `npm run build && npm run lint && npm test`.

**Course integrity — `npm run audit:courses`.** Course content lives in three places that
drift apart: the database (`courses.content_blocks`), the repo (`public/h5p/content/<slug>/pN`)
and the deployed site. Because the database is **shared with production**, editing
`content_blocks` goes live *immediately* while the page files wait for a deploy — that gap is
how a learner ends up on a 404 halfway through a course. The audit checks all three agree:
pages exist, are **committed** (not local-only), declare every H5P library they use, resolve
their images, match their gating question counts, and have an assessment bank. Use
`npm run audit:courses:prod` to also HEAD every page on the live site.

It runs automatically as `predeploy`, so `npm run deploy` is gated on it. **It does not gate
`git push`** — the primary deploy route — so run it yourself after any course restructure, or
add it to CI. Rule of thumb: change `content_blocks` immediately *before* deploying, never
hours ahead.

One-time setup on a new machine: `npm run vercel:login`, then `npm run vercel:link`.
`npm run vercel:env` pulls the project's environment variables into `.env.local`.

**Push auth.** The remote uses SSH with a repo-scoped key (`~/.ssh/id_ed25519_homecare`, wired
up via this repo's `core.sshCommand`), so pushes need no token and never expire. The public key
is registered on the repo as a deploy key **with write access**
(GitHub → repo → Settings → Deploy keys).

> Note: `vercel project inspect` does **not** report the Git connection — its absence there
> means nothing. Check Project → Settings → Git in the dashboard, or just look at whether a
> push produced a deployment in `vercel ls`.

Do **not** install `gh` into a temp directory — a previous setup did that and wrote a dead
absolute path into `~/.gitconfig`, which silently disabled the keychain helper for every repo
on the machine.

`npm run vercel:env` pulls the project's environment variables into `.env.local` — handy when
setting up a new machine. Both `.vercel/` and `.env.local` are gitignored.

Before any production deploy: `npm run build && npm run lint && npm test`.

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** — server only |
| `STRIPE_SECRET_KEY` | Use a **live-mode restricted key** with Customers, Checkout Sessions and Billing Portal write |
| `STRIPE_WEBHOOK_SECRET` | From the registered webhook endpoint (step 4) |
| `STRIPE_PRICE_CORE` / `_CORE_FORMS` / `_CORE_RECRUITMENT` / `_FULL` | Live price ids (`node scripts/setup-stripe.mjs` in live mode) |
| `RESEND_API_KEY` | Email |
| `EMAIL_FROM` | Verified domain sender, e.g. `noreply@mycareacademy.co.uk` |
| `CRON_SECRET` | Long random string; Vercel Cron sends it as a Bearer token |
| `MFA_ENFORCED` | **Set to `true` for production** (console roles must use TOTP). The code enforces unless the value is literally `false` (`lib/auth.ts`) |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (used for invite/checkout links) |

## 2. Supabase

- **Migrations:** apply every file in `supabase/migrations/` in order.
- **Auth hook:** enable *Customize Access Token (JWT) Claims* → `public.custom_access_token_hook`.
- **Region:** Frankfurt / `eu-central-1` (EU). UK data processed under UK–EU adequacy. If a
  buyer mandates UK-only residency, recreate the project in London (`eu-west-2`).
- **Encryption:** Supabase encrypts at rest (AES-256) and in transit (TLS) by default.
- **Backups:** enable Point-in-Time Recovery (Pro plan). Test a restore before launch.
- **SMTP:** point Supabase Auth SMTP at Resend (or keep app-level Resend for invites).
- **Storage buckets:** `certificates`, `form-uploads`, `candidate-docs` are private; access is
  via short-lived signed URLs only.

## 3. Security

Re-checked against the code and the live dashboards on 9 November 2026 (v3.15.0), after the
full QA review of 2 November (`docs/QA-REPORT.md`).

- [ ] `MFA_ENFORCED=true` — console roles forced through TOTP at AAL2.
      *In the code:* done. `requireAdminMfa()` in `lib/auth.ts` sends `platform_admin`,
      `org_admin` and `org_office` to `/mfa` unless they are at AAL2, and the only thing that
      switches it off is the value `false` (`tests/mfa.test.ts`). *On Vercel:* the variable is
      set for Production (created at setup, July 2026) but its value can't be read from here.
      **Still to do:** one look at Project → Settings → Environment Variables to confirm it
      isn't `false`.
- [x] RLS enabled on every table; cross-org access covered by tests.
      Vitest: `security-audit`, `rls`, `enrolments`, `forms-rls`, `recruitment-rls`, `quiz-rls`
      plus the per-feature `*-rls` suites (bespoke reports, candidate login, company forms,
      entitlements, face-to-face, feedback rounds, form records, observations, office role,
      service audits, staff audits, stars). Playwright: `tests/e2e/cross-org.spec.ts` (a
      manager of another company, a carer and a signed-out visitor get nothing from record
      pages or files). Live security advisors on 9 Nov 2026 list no table without RLS; the four
      service-role-only tables (`integration_keys`, `alert_endpoints`, `alert_deliveries`,
      `policy_reminder_log`) have RLS on and no policies on purpose (QA finding 13).
- [x] Audit trail (`audit_logs`) records org/staff/candidate/billing changes.
      `logAudit()` in `lib/audit.ts` is called from about fifty places: the platform console's
      organisation pages (package, status, removal, integration keys), a staff member's file
      and evidence pack, recruitment, the Stripe webhook and `/org/billing`, every Settings
      page, HR letters, leavers and probation, and a learner's own account deletion. The
      platform console shows the latest entries on Platform → Settings (`/platform/settings`).
- [x] Rate limiting on the public verify page — in place: 15 look-ups per IP per minute
      (`app/(marketing)/verify/page.tsx`, `lib/rate-limit.ts`), with a visible "slow down"
      message. The limiter is still in-memory and per instance, which is fine at today's
      volume; the swap for Upstash / Vercel KV is only needed at scale and is not scheduled.
      Sign-in itself relies on Supabase Auth's own throttling (QA decision Q13).
- [ ] Rotate any secret that was shared during setup (Supabase keys, Resend key).
      **Still to do, Saj's call.** Nothing in the code can show this. Vercel's variable list
      shows the Supabase, Resend and cron secrets were created at setup (July 2026) and never
      re-added, so no rotation has happened since. There are no Stripe keys on Vercel: billing
      is parked. QA finding 20 confirmed no secret is in any tracked file.

## 4. Stripe

1. Switch the dashboard to **live mode**; run `node scripts/setup-stripe.mjs` to create live
   products/prices; put the price ids in Vercel env.
2. **Webhook:** Developers → Webhooks → add endpoint `https://<domain>/api/stripe/webhook`,
   events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
3. Confirm a test subscription flips `forms_enabled`/`recruitment_enabled` (webhook logs).

## 5. Cron (Vercel)

`vercel.json` schedules `/api/cron/daily` (07:00) and `/api/cron/weekly` (Mon 08:00). Vercel
sends `Authorization: Bearer $CRON_SECRET` automatically. Verify a manual run:
`curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/daily?dryRun=1`.

## 6. GDPR

- [x] Privacy policy live at `/privacy` (`app/(marketing)/privacy/page.tsx`, with the public
      site's header and footer since v2.28.1; sections on what we hold, your rights, cookies
      and retention). Cookie banner: `components/cookie-consent.tsx`, mounted in
      `app/layout.tsx` on every page, essential cookies only, remembered in the browser.
      The public-site crawl and accessibility runs visit `/privacy`
      (`tests/e2e/flows-documents.spec.ts`, `tests/e2e/a11y.spec.ts`).
- [x] Learners can export data + delete their account from `/learn`.
      `/learn/profile` → "Download a copy of your data" (a CSV of the training record: course,
      completion, expiry, certificate number, best score — `exportMyDataAction`) and
      "Delete my account" (`deleteMyAccountAction`: purges their stored files, anonymises
      their email log and reports, writes an audit entry, deletes the login;
      `tests/user-erasure.test.ts`). Console roles can't self-delete: another administrator
      removes them. Note the export is the training record only, not every table that names
      the person (forms, supervisions, HR); widen it if a subject-access request ever needs
      more.
- [ ] Data-retention window set (`app_settings.data_retention_months`, default 36).
      **Still outstanding.** The setting exists (migration `20260701154605`) but nothing reads
      it: no cron job or query deletes or anonymises records by age, and the 7-year retention
      review of 26 Oct 2026 (migration `20261026100000_retention_dates`) was withdrawn the
      same day. Records are kept for as long as the organisation exists (`lib/org-removal.ts`),
      while the privacy policy says they are kept "for the period configured by your employer".
      Needs a decision on the policy (per company? per record type? the 7-year CQC/HMRC
      periods for staff records?) before anything is built.

## 7. Launch smoke test

1. Invite an organisation → admin accepts → sets password → MFA enrolment.
2. Assign a course → learner completes content → passes quiz → downloads certificate.
3. Verify the certificate at `/verify`.
4. Subscribe to a plan → confirm the add-on turns on.

## Runbook — common operations

- **Restore data:** Supabase → Database → Backups → restore to a point in time (test first).
- **Rotate a secret:** update in Supabase/Stripe/Resend, then update Vercel env and redeploy.
- **Disable an org:** platform console → open org → set status *suspended* (members blocked).
- **Reset a user's password:** Supabase Auth → user → send recovery, or admin API.
- **Investigate activity:** platform console → Settings (`/platform/settings`) → Audit log, or query `audit_logs` directly.

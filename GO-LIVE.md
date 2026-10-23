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
| `MFA_ENFORCED` | **Set to `true` for production** (admins must use TOTP) |
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

- [ ] `MFA_ENFORCED=true` — admins forced through TOTP at AAL2.
- [ ] RLS enabled on every table; cross-org access covered by tests
      (`npm test` → `security-audit`, `rls`, `enrolments`, `forms-rls`, `recruitment-rls`,
      `quiz-rls`).
- [ ] Audit trail (`audit_logs`) records org/staff/candidate/billing changes.
- [ ] Rate limiting on the public verify page (swap the in-memory limiter for Upstash/Vercel KV
      at scale — `lib/rate-limit.ts`).
- [ ] Rotate any secret that was shared during setup (Supabase keys, Stripe keys, Resend key).

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

- [ ] Privacy policy live at `/privacy`; cookie-consent banner shown.
- [ ] Learners can export data + delete their account from `/learn`.
- [ ] Data-retention window set (`app_settings.data_retention_months`, default 36).

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
- **Investigate activity:** platform console → Automation → Audit log / Recent notifications.

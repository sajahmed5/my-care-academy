# QA report — full review after the November 2026 redesign

Branch `fix/full-review`. Started 2 November 2026. This file is the running log:
how the QA harness works, what each role may do, what was found, what was fixed,
and what still needs a decision from Saj.

## 1. How to run the QA suite

The QA suite never touches the live Supabase project. It runs against the
**local Supabase stack** (Docker via Colima on this Mac), built from the
migrations in `supabase/migrations/` and the auth settings in `supabase/config.toml`.

One-time setup on a machine:

```bash
brew install colima docker     # a local Docker runtime (no Docker Desktop needed)
colima start --cpu 4 --memory 6
npx supabase start             # pulls the images and applies every migration
npx playwright install chromium
```

Every run:

```bash
npm run test:qa
```

which does, in order:

1. `npm run qa:env` — reads the local stack's URL and keys (`supabase status`)
   into the git-ignored `.env.test` (template: `.env.test.example`).
2. `npm run qa:seed` — `scripts/seed-test-orgs.mjs`: resets and re-creates the
   QA organisations and logins (strong random passwords, written to `.env.test`,
   never printed), with every account already confirmed so no email step is needed.
3. `npm run qa:e2e` — Playwright: a global setup signs in once per role and saves
   each session under `tests/e2e/.auth/` (git-ignored); the specs then run
   already signed in. The app is built and served on `http://localhost:3100`
   with `.env.test` so it can never read `.env.local`.
4. `npm run test` — the existing Vitest suite, also pointed at the local stack.

### The QA organisations and logins

| Organisation | Package | Purpose |
|---|---|---|
| QA Test Care Ltd | Enterprise (`full`), paid | Realistic data: ~15 staff, 10 clients, training in every state, supervisions/appraisals in every state, service audits, holidays, a complaint, policies, forms |
| QA Empty Care Ltd | Free trial, 5 days left | Brand-new: empty states and the setup checklist |
| QA Other Care Ltd | Growth | A second company with its own data, to prove companies can't see each other |
| QA Portal Care Ltd | Enterprise with white label | Its own web address (`qa-portal.localhost`) and a rostering-portal key |

| Login (`.env.test` key) | Role in the code | Company |
|---|---|---|
| `QA_PLATFORM_ADMIN` | `platform_admin` (the console admin) | none (platform-wide) |
| `QA_TEST_MANAGER` | `org_admin` (manager) | QA Test Care |
| `QA_TEST_TRAINER` | `org_office` (office worker — see Q1) | QA Test Care |
| `QA_TEST_STAFF` | `learner` (carer with training to do) | QA Test Care |
| `QA_TEST_STAFF_NEW` | `learner` (never signed in) | QA Test Care |
| `QA_EMPTY_MANAGER` | `org_admin` | QA Empty Care |
| `QA_OTHER_MANAGER` | `org_admin` | QA Other Care |
| `QA_PORTAL_MANAGER` | `org_admin` | QA Portal Care |
| `QA_CANDIDATE` | `candidate` (an applicant following their application) | none |

## 2. Baseline before any change (2 Nov 2026, v3.9.2)

| Check | Result |
|---|---|
| `npm install` | clean |
| `npm run lint` | passes, 7 warnings (unused variables in `app/org/audits/new/run-service-audit.tsx`, `lib/client-qa.ts`, `lib/bespoke/xlsx-write.ts`, `scripts/apply-rightsize.mjs`, three test files) |
| `npx tsc --noEmit` | passes after a fresh build. Against a stale `.next/types` it reports 2 errors in the generated validator (a missing `app/org/learners/layout`), which is a stale-artefact problem, not a code one. |
| `npm run build` | passes |
| `npm test` (Vitest) | see §2.1 — the suite in the repo runs against the **live** project (`tests/helpers.ts` loads `.env.local`), so it was not run as-is; it is re-run against the local stack in §10. |

## 3. Roles found in the code

The brief names four roles: console admin, manager, trainer, staff/learner. The
code (`lib/auth.ts`) has five, and no trainer:

| Code role | Name in the UI | What it is |
|---|---|---|
| `platform_admin` | Platform admin | Platform-wide: every organisation, the course library, packages, billing, bespoke reports, face-to-face sessions. No organisation of its own. `/platform/*`. |
| `org_admin` | Manager | The organisation console (`/org/*`) **and** Settings (`/org/settings/*`: billing, who has console access, each add-on's forms and wording). |
| `org_office` | Office | The organisation console without Settings. In the database the two console roles are one (`is_console_user()`); the split is enforced in the app with `requireRole("org_admin")`. |
| `learner` | Learner / carer | Their own training, certificates, forms, policies, HR letters, reviews (`/learn/*`). Managers and office workers also have a `/learn` view of their own training. |
| `candidate` | Applicant | Someone applying for a job, with a login only to follow their own application (`/my-application/*`). No organisation. |

Other access paths: the **rostering portal API** (`/api/portal/*`, bearer
integration key, resolves the organisation from the key), **cron** routes
(`/api/cron/*`, bearer `CRON_SECRET`), public token links (apply, survey, concern,
reference, statement, exit interview, classroom sign-in), and **white-label**
hosts (a company's own domain: sign-in only for that company's staff; marketing
pages redirect back to mycareacademy.co.uk).

## 4. Permissions matrix

"Who" is what the route's guard allows (`lib/auth.ts`). "Feature" is the
package feature the page additionally needs (`lib/entitlements.ts`); without
it a console user lands on `/org/locked/<feature>`. Row-level security in the
database is the second gate for every read and write: a signed-in user only
ever sees rows of their own organisation (`current_org_id()` from the JWT).

Write access follows the page: every server action in a folder carries the
same guard as its page (checked file by file in `app/**/actions.ts`; the few
that looked unguarded use a local helper such as `requireComplaints()` or
`gate()` that calls the same functions). Where a manager-only action lives
inside a console page it is listed under "Manager only" below.

**Manager only (`org_admin`), inside pages an office worker can also open:**
- inviting or removing a manager, and changing who has console access (`app/org/actions.ts`)
- the Account / billing page (`/org/billing`) and all of `/org/settings/*`
- deleting a service audit or QA record (`app/org/audits/actions.ts`, `app/org/audits/qa/actions.ts`)
- deleting a complaint (`app/org/complaints/actions.ts`)
- asking for a bespoke report (`app/org/reports/actions.ts`)
- recruitment: deleting a candidate (`app/org/recruitment/actions.ts`)

**Staff (`learner`) can only ever read or write their own rows**: enrolments,
quiz attempts, certificates, form responses, policy acceptances, their own
supervision signature, their own HR letters and holiday requests.

### 4.1 Routes

| Route | Who | Feature needed |
|---|---|---|
| `/care-training-manchester-stockport` | Public | — |
| `/contact (actions)` | Public | — |
| `/contact` | Public | — |
| `/developers` | Public | — |
| `/(marketing)` | Public | — |
| `/privacy` | Public | — |
| `/training/care-certificate` | Public | — |
| `/training/courses` | Public | — |
| `/training/cqc-compliance` | Public | — |
| `/training/mandatory-training` | Public | — |
| `/training` | Public | — |
| `/training/pricing` | Public | — |
| `/verify` | Public | — |
| `/account (actions)` | Manager | — |
| `/account` | Any signed-in, active user | — |
| `/api/cron/daily` | Cron (Bearer CRON_SECRET) | — |
| `/api/cron/reports` | Cron (Bearer CRON_SECRET) | — |
| `/api/cron/trials` | Cron (Bearer CRON_SECRET) | — |
| `/api/cron/weekly` | Cron (Bearer CRON_SECRET) | — |
| `/api/portal/assign` | Rostering portal (Bearer integration key) | — |
| `/api/portal/catalogue` | Rostering portal (Bearer integration key) | — |
| `/api/portal/records` | Rostering portal (Bearer integration key) | — |
| `/api/portal/sync-learners` | Rostering portal (Bearer integration key) | — |
| `/api/stripe/webhook` | Stripe webhook (signature) | — |
| `/apply/[token]` | Public | — |
| `/apply (actions)` | Public | — |
| `/apply/form` | Public | — |
| `/apply/test (actions)` | Public | — |
| `/apply/test` | Public | — |
| `/auth/confirm` | Public | — |
| `/auth/set-password` | Public | — |
| `/auth/setup` | Public | — |
| `/auth/signout` | Public | — |
| `/concern/[token] (actions)` | Public | — |
| `/concern/[token]` | Public | — |
| `/dashboard` | Any signed-in user | — |
| `/exit (actions)` | Public | — |
| `/exit` | Public | — |
| `/forgot-password (actions)` | Public | — |
| `/forgot-password` | Public | — |
| `/learn (actions)` | Manager, Office, Staff (own data) | — |
| `/learn/actions` | Manager, Office, Staff (own data) | — |
| `/learn/certificates/[id]/download` | Manager, Office, Staff (own data) | — |
| `/learn/certificates` | Manager, Office, Staff (own data) | — |
| `/learn/certificates/passport` | Public | — |
| `/learn/classroom/[token] (actions)` | Manager, Office, Staff (own data) | — |
| `/learn/classroom/[token]` | Manager, Office, Staff (own data) | — |
| `/learn/courses/[courseId]` | Manager, Office, Staff (own data) | — |
| `/learn/courses/[courseId]/quiz` | Manager, Office, Staff (own data) | — |
| `/learn/forms/[assignmentId]` | Manager, Office, Staff (own data) | — |
| `/learn/forms (actions)` | Any signed-in user | — |
| `/learn/forms` | Manager, Office, Staff (own data) | — |
| `/learn/hr (actions)` | Manager, Office, Staff (own data) | recruitment.tracker |
| `/learn/hr/letters/[id]` | Public | — |
| `/learn/hr` | Manager, Office, Staff (own data) | recruitment.tracker |
| `/learn/modules/all` | Manager, Office, Staff (own data) | — |
| `/learn/modules/completed` | Manager, Office, Staff (own data) | — |
| `/learn/modules` | Manager, Office, Staff (own data) | — |
| `/learn/notifications` | Manager, Office, Staff (own data) | — |
| `/learn` | Manager, Office, Staff (own data) | — |
| `/learn/policies/[code]` | Manager, Office, Staff (own data) | documents.library |
| `/learn/policies` | Manager, Office, Staff (own data) | documents.library |
| `/learn/profile` | Manager, Office, Staff (own data) | — |
| `/learn/programmes/[slug]` | Manager, Office, Staff (own data) | — |
| `/learn/reviews (actions)` | Manager, Office, Staff (own data) | — |
| `/learn/reviews` | Manager, Office, Staff (own data) | people.supervisions |
| `/login` | Public | — |
| `/mfa` | Public | — |
| `/my-application (actions)` | Candidate | — |
| `/my-application/health/[id]` | Candidate | — |
| `/my-application` | Candidate | — |
| `/my-application/sign/[id]/[doc]` | Candidate | — |
| `/org (actions)` | Manager, Office | — |
| `/org/audits/[id]` | Manager, Office | quality.audits |
| `/org/audits (actions)` | Manager | quality.audits |
| `/org/audits/governance (actions)` | Manager, Office | quality.audits |
| `/org/audits/governance` | Manager, Office | quality.audits |
| `/org/audits/governance/pdf` | Manager, Office | quality.audits |
| `/org/audits/new` | Manager, Office | quality.audits |
| `/org/audits` | Manager, Office | quality.audits |
| `/org/audits/qa/[id]` | Manager, Office | complaints.register, quality.audits |
| `/org/audits/qa (actions)` | Manager | complaints.register, quality.audits |
| `/org/audits/qa/new` | Manager, Office | quality.audits |
| `/org/billing` | Manager | platform.white_label |
| `/org/certificates/[id]/download` | Manager, Office | — |
| `/org/certificates/pack` | Manager, Office | — |
| `/org/certificates` | Manager, Office | — |
| `/org/classroom/[id]` | Manager, Office | training.classroom |
| `/org/classroom (actions)` | Manager, Office | training.classroom |
| `/org/classroom` | Manager, Office | training.classroom |
| `/org/clients/[id]` | Manager, Office | clients.list |
| `/org/clients (actions)` | Manager, Office | clients.list |
| `/org/clients/import` | Manager, Office | clients.list |
| `/org/clients/new` | Manager, Office | clients.list |
| `/org/clients` | Manager, Office | clients.list |
| `/org/clients/template` | Manager, Office | — |
| `/org/complaints/[id]/bundle` | Manager, Office | complaints.register |
| `/org/complaints/[id]/documents/[docId]` | Manager, Office | — |
| `/org/complaints/[id]/interim` | Manager, Office | complaints.register |
| `/org/complaints/[id]` | Manager, Office | clients.list, complaints.register |
| `/org/complaints/[id]/pdf` | Manager, Office | — |
| `/org/complaints (actions)` | Manager | complaints.register |
| `/org/complaints/compliments (actions)` | Manager, Office | complaints.register |
| `/org/complaints/compliments` | Manager, Office | clients.list, complaints.register |
| `/org/complaints/guidance` | Manager, Office | clients.list, complaints.register |
| `/org/complaints/new` | Manager, Office | complaints.register |
| `/org/complaints` | Manager, Office | complaints.register |
| `/org/complaints/trends` | Manager, Office | complaints.register |
| `/org/courses/admin` | Manager, Office | — |
| `/org/courses` | Manager, Office | — |
| `/org/courses/statistics` | Manager, Office | — |
| `/org/due/appraisals` | Public | — |
| `/org/due/audits` | Manager, Office | quality.audits |
| `/org/due/competency` | Manager, Office | people.competency |
| `/org/due/forms` | Manager, Office | forms.builder |
| `/org/due` | Manager, Office | — |
| `/org/due/policies` | Manager, Office | documents.library |
| `/org/due/spot-checks` | Manager, Office | people.competency |
| `/org/due/supervisions` | Public | — |
| `/org/face-to-face (actions)` | Manager, Office | training.face_to_face |
| `/org/face-to-face` | Manager, Office | training.face_to_face |
| `/org/feedback/[id]` | Manager, Office | complaints.register, quality.feedback |
| `/org/feedback/[id]/poster` | Manager, Office | quality.feedback |
| `/org/feedback/[id]/report` | Manager, Office | quality.feedback |
| `/org/feedback/[id]/send` | Manager, Office | quality.feedback |
| `/org/feedback (actions)` | Manager, Office | complaints.register, quality.feedback |
| `/org/feedback` | Manager, Office | quality.feedback |
| `/org/forms (actions)` | Manager, Office | forms.builder |
| `/org/forms/complete/[assignmentId]` | Manager, Office | forms.builder |
| `/org/forms/fill/[code]` | Manager, Office | forms.builder |
| `/org/forms/fill` | Manager, Office | — |
| `/org/forms/library/[code]` | Manager, Office | forms.builder |
| `/org/forms/library/[code]/responses/[assignmentId]` | Manager, Office | forms.builder |
| `/org/forms/logs/[code]/csv` | Manager, Office | — |
| `/org/forms/logs/[code]` | Manager, Office | forms.builder |
| `/org/forms/logs/[code]/pdf` | Manager, Office | — |
| `/org/forms/logs (actions)` | Manager, Office | forms.builder |
| `/org/forms/own` | Public | — |
| `/org/forms` | Manager, Office | forms.builder |
| `/org/forms/responses/[id]` | Manager, Office | forms.builder |
| `/org/forms/responses/[id]/pdf` | Manager, Office | forms.builder |
| `/org/hr/absence/[id]` | Manager, Office | recruitment.tracker |
| `/org/hr/absence (actions)` | Manager, Office | — |
| `/org/hr/absence` | Manager, Office | recruitment.tracker |
| `/org/hr/cases/[id]` | Manager, Office | recruitment.tracker |
| `/org/hr/cases/[id]/pdf` | Manager, Office | — |
| `/org/hr/cases (actions)` | Manager, Office | — |
| `/org/hr/cases/new` | Manager, Office | recruitment.tracker |
| `/org/hr/cases` | Manager, Office | recruitment.tracker |
| `/org/hr/documents` | Manager, Office | recruitment.tracker |
| `/org/hr/holidays (actions)` | Manager, Office | — |
| `/org/hr/holidays` | Manager, Office | recruitment.tracker |
| `/org/hr/leavers/[id]` | Manager, Office | recruitment.tracker |
| `/org/hr/leavers (actions)` | Manager, Office | — |
| `/org/hr/leavers` | Manager, Office | recruitment.tracker |
| `/org/hr/letters/[id]` | Manager, Office | recruitment.tracker |
| `/org/hr/letters/[id]/pdf` | Manager, Office | — |
| `/org/hr/letters/[id]/word` | Manager, Office | — |
| `/org/hr/letters (actions)` | Manager, Office | — |
| `/org/hr/probation (actions)` | Manager, Office | — |
| `/org/hr/probation` | Manager, Office | recruitment.tracker |
| `/org/hr/probation/review/[id]` | Manager, Office | recruitment.tracker |
| `/org/incidents` | Public | — |
| `/org/learners/admin` | Manager, Office | — |
| `/org/learners` | Manager, Office | — |
| `/org/learners/stars` | Manager, Office | — |
| `/org/learners/statistics` | Manager, Office | — |
| `/org/locked/[feature] (actions)` | Manager, Office | — |
| `/org/locked/[feature]` | Manager, Office | — |
| `/org/observations/[userId]` | Manager, Office | training.observations |
| `/org/observations (actions)` | Manager, Office | — |
| `/org/observations` | Manager, Office | training.observations |
| `/org` | Manager, Office | — |
| `/org/pips/[id]` | Manager, Office | people.performance_plans |
| `/org/pips/[id]/pdf` | Manager, Office | — |
| `/org/pips (actions)` | Manager, Office | people.performance_plans |
| `/org/pips/new` | Manager, Office | people.performance_plans |
| `/org/pips` | Manager, Office | complaints.register, people.performance_plans |
| `/org/policies/[code]` | Manager, Office | documents.library |
| `/org/policies (actions)` | Manager, Office | documents.library |
| `/org/policies` | Manager, Office | documents.library |
| `/org/policies/people` | Manager, Office | documents.library |
| `/org/recruitment/[id]/application` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]/dbs-risk` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]/interview` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]/offer` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]/reference/[refId]` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]/reject` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]/shadowing` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]/signed/[doc]` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]/starter` | Manager, Office | recruitment.tracker |
| `/org/recruitment/[id]/zip` | Manager, Office | — |
| `/org/recruitment (actions)` | Manager | recruitment.tracker |
| `/org/recruitment` | Manager, Office | recruitment.tracker |
| `/org/reports (actions)` | Manager | reports.bespoke |
| `/org/reports/bespoke/[id]/download` | Manager, Office | — |
| `/org/reports/bespoke/[id]` | Manager, Office | reports.bespoke |
| `/org/reports` | Manager, Office | reports.bespoke |
| `/org/reports/requests/[id]` | Manager | reports.bespoke |
| `/org/reports/requests/new` | Manager | reports.bespoke |
| `/org/settings/complaints/link (actions)` | Manager | complaints.register |
| `/org/settings/complaints/link` | Manager | complaints.register |
| `/org/settings/complaints/process` | Manager | complaints.register |
| `/org/settings/forms/[code]` | Manager | forms.builder |
| `/org/settings/forms (actions)` | Manager | forms.builder |
| `/org/settings/forms` | Manager | forms.builder |
| `/org/settings/forms/surveys (actions)` | Manager | quality.feedback |
| `/org/settings/forms/surveys` | Manager | quality.feedback |
| `/org/settings/hr/absence` | Manager | recruitment.tracker |
| `/org/settings/hr (actions)` | Manager | recruitment.tracker |
| `/org/settings/hr/cases` | Manager | recruitment.tracker |
| `/org/settings/hr/holidays` | Manager | recruitment.tracker |
| `/org/settings/hr/letters/[kind]` | Manager | recruitment.tracker |
| `/org/settings/hr/letters` | Manager | recruitment.tracker |
| `/org/settings/hr` | Manager | recruitment.tracker |
| `/org/settings/integration (actions)` | Manager | platform.portal_api |
| `/org/settings/integration/other` | Manager | platform.portal_api |
| `/org/settings/integration` | Manager | platform.portal_api |
| `/org/settings` | Manager | — |
| `/org/settings/policies (actions)` | Manager | documents.library |
| `/org/settings/policies` | Manager | documents.library |
| `/org/settings/recruitment/documents` | Manager | recruitment.tracker |
| `/org/settings/recruitment/forms` | Manager | recruitment.tracker |
| `/org/settings/recruitment` | Manager | recruitment.tracker |
| `/org/settings/reports (actions)` | Manager | reports.bespoke |
| `/org/settings/reports` | Manager | reports.bespoke |
| `/org/settings/service-audits (actions)` | Manager | quality.audits |
| `/org/settings/service-audits/edit` | Manager | quality.audits |
| `/org/settings/service-audits` | Manager | quality.audits |
| `/org/settings/staff-audits (actions)` | Manager | — |
| `/org/settings/staff-audits/edit` | Manager | — |
| `/org/settings/staff-audits` | Manager | — |
| `/org/settings/white-label (actions)` | Manager | — |
| `/org/settings/white-label/domain (actions)` | Manager | — |
| `/org/settings/white-label/domain` | Manager | platform.white_label |
| `/org/settings/white-label` | Manager | platform.white_label |
| `/org/staff/[userId] (actions)` | Manager, Office | — |
| `/org/staff/[userId]/competency/new` | Manager, Office | people.competency |
| `/org/staff/[userId]/evidence/files` | Manager, Office | — |
| `/org/staff/[userId]/evidence` | Manager, Office | — |
| `/org/staff/[userId]` | Manager, Office | — |
| `/org/staff/[userId]/spot-checks/new` | Manager, Office | clients.list, people.competency |
| `/org/staff/[userId]/supervisions/new` | Manager, Office | people.supervisions |
| `/platform (actions)` | Platform admin | — |
| `/platform/analytics` | Platform admin | — |
| `/platform/bespoke-reports/[id]/download` | Platform admin | — |
| `/platform/bespoke-reports/[id]` | Platform admin | — |
| `/platform/bespoke-reports (actions)` | Platform admin | — |
| `/platform/bespoke-reports` | Platform admin | — |
| `/platform/bespoke-reports/requests/[id]` | Platform admin | — |
| `/platform/billing` | Platform admin | — |
| `/platform/courses/[courseId]` | Platform admin | — |
| `/platform/courses` | Platform admin | — |
| `/platform/documents/[code]` | Platform admin | — |
| `/platform/documents (actions)` | Platform admin | — |
| `/platform/documents` | Platform admin | — |
| `/platform/face-to-face/[id]` | Platform admin | — |
| `/platform/face-to-face/[id]/register` | Platform admin | — |
| `/platform/face-to-face (actions)` | Platform admin | — |
| `/platform/face-to-face` | Platform admin | — |
| `/platform/forms/[code]` | Platform admin | — |
| `/platform/forms (actions)` | Platform admin | — |
| `/platform/forms` | Platform admin | — |
| `/platform/organisations/[id]` | Platform admin | — |
| `/platform/organisations` | Platform admin | — |
| `/platform` | Platform admin | — |
| `/platform/reports/[id]` | Platform admin | — |
| `/platform/reports (actions)` | Platform admin | — |
| `/platform/reports` | Platform admin | — |
| `/platform/settings` | Platform admin | — |
| `/platform/tiers (actions)` | Platform admin | — |
| `/platform/tiers` | Platform admin | — |
| `/reference (actions)` | Public | — |
| `/reference` | Public | — |
| `/report (actions)` | Public | — |
| `/report` | Any signed-in user | — |
| `/statement (actions)` | Public | — |
| `/statement` | Public | — |
| `/survey/[token] (actions)` | Public | — |
| `/survey/[token]` | Public | — |
| `/suspended` | Public | — |
| `/trial-ended` | Public | — |
### 4.2 Questions for Saj about what a role should be allowed to do

- **Q1 — Trainer.** The brief lists a *trainer* role; the code has none. The
  nearest is `org_office` (office worker: the whole console except Settings).
  For this review the "trainer" login is an office worker. Should there be a
  real trainer role (e.g. sees Training and Compliance only, no HR, no clients)?
- **Q2 — Office worker and HR cases.** `lib/hr/case-access.ts` hides
  disciplinary/grievance cases from an office worker unless they are named on
  the case. Is that intended for the other HR pages too (absence, probation,
  leavers are fully open to office workers today)?
- **Q3 — Office worker and staff documents / evidence packs.** An office worker
  can download any carer's evidence pack and DBS documents. Intended?
- **Q4 — Staff seeing colleagues.** `/learn/classroom/[token]` and some pickers
  list colleagues' names to a carer. Intended?
- **Q5 — Platform admin inside a company.** A platform admin can open any
  organisation's console pages? Today `/org/*` sends a platform admin to
  `/platform` (no "view as" mode). Fine as is?

## 5. Findings log

Severity: **Critical** (data exposure, wrong-company data, cannot sign in),
**High** (a flow is broken or shows wrong numbers), **Medium** (works but
wrong/misleading or inaccessible), **Low** (cosmetic). Status: Open / Fixed
(commit) / Question.

| # | Page | Role | Steps | Expected | Actual | Severity | Status |
|---|---|---|---|---|---|---|---|
| 1 | `supabase db reset` / preview branch | dev | Apply the migrations to a fresh database | All 123 apply | Three stop: `20261020120000` revokes on a hand-made backup table that only exists live; `20261031130000` and `20261101120000` assert "27 published policies" | High (blocks any staging/preview database) | Fixed v3.9.3 |
| 2 | `npm test` | dev | Run the Vitest suite on a fresh stack | Suite loads | `tests/csv-import.test.ts` cannot load (`server-only` has no package under Vitest); `tests/mfa.test.ts` fails because the local auth config had TOTP off; the MRR test counts free trials the code leaves out | Medium | Fixed v3.9.4 |
| 3 | `/org` Today, 390px | manager | Open Today on a phone with a long "Needs your attention" list | Page fits the screen | The attention list (a long list of names) is wider than the screen: page is 662px wide, the phone zooms the whole page out | High | Fixed (`min-w-0` on the section) |
| 4 | `/org/learners` (also Stars, form logs, Clients, a carer's file tabs), 390px | manager | Open the staff list on a phone | The table scrolls inside its card | The hidden "Open" label in the table header is absolutely positioned outside the scroll wrapper, so the page is 932px wide and the phone zooms out; the brief's "table scrolls horizontally on small screens" was not met | High | Fixed (`relative` on the scroll wrappers) + `tests/e2e/mobile.spec.ts` |
| 5 | `/org/learners` | manager | Compare the header with the segmented control | Same count | Header says "16 people" (active only), the All chip says "All · 17" (includes leavers), footer "17 of 17" | Low | Fixed (header counts the list) |
| 6 | `/org/courses` | manager | Read the six figures | Completed late ≤ Completed | "Completed late 19" beside "Completed 18": every certificate a course ever gathered (renewals, an expired one) counted as a late completion | Low | Fixed (newest certificate per course) |
| 7 | Weekly digest (`/api/cron/weekly`, `lib/engine.ts`) | cron | Run with more than ~390 organisations entitled to policies | Digest sent | `.in("organisation_id", everyOrg)` puts every id in one URL; past ~390 the request fails and the whole weekly digest fails | High (future scale) | Fixed (batches of 100) |
| 8 | Remove organisation (`lib/org-removal.ts`) | platform admin / trials cron | Remove a company with more than 1,000 people or certificates | Everything removed | Unpaged reads: logins and certificate PDFs past 1,000 are left behind | High (data retention) | Fixed (paged reads) |
| 9 | AI monthly limit (`lib/ai.ts`) | manager | More than 1,000 AI requests in a month | Spend counted, limit enforced | `.limit(5000)` is really 1,000: spend under-counted after 1,000 requests, so the £ limit stops working | Medium | Fixed (paged) |
| 10 | Feedback → send round (`app/org/feedback/actions.ts`) | manager | Send a round to more than 1,000 people, or tick more than 390 staff / 300 clients | Everyone invited once | Already-invited read capped at 1,000 (duplicates on a second send); ticked staff past ~390 made the request fail (nobody invited); ticked clients past 300 silently dropped | Medium | Fixed (paged + batched) |
| 11 | Many list pages (see §6) | manager / platform admin | Lists with more than 1,000 (or 500/200/100) rows | All rows, or a "showing N of M" | Silently shorter lists; most are per-company and unlikely to be hit; the platform issue-report list and the organisations lists grow without bound | Low–Medium | Open: see §6 for the list; question Q6 |
| 12 | Any page, under heavy parallel load | any | Many simultaneous requests to the local stack | Page renders | Occasionally "Something went wrong" with `Paged read failed: An invalid response was received from the upstream server` (the local PostgREST under load). The error page itself is correct; seen only under artificial load | Info | Noted |
| 13 | Supabase security advisors (live project) | — | `get_advisors security` | No warnings | **Leaked-password protection is off** (Auth → Passwords); `verify_certificate()` is callable by `anon` (intended: the public certificate check); five `security definer` functions callable by signed-in users (`has_feature`, `my_entitlements`, `can_see_hr_case`, `face_to_face_places_taken`, `staff_started_at`: all read-only and intended); four service-role-only tables with RLS on and no policies (`integration_keys`, `alert_endpoints`, `alert_deliveries`, `policy_reminder_log`: intended); a leftover `_bk_hg_cert_expiry_20260927` backup table with no primary key | Low | Question Q7 (enable leaked-password protection; drop the backup table?) |
| 14 | Supabase performance advisors (live project) | — | `get_advisors performance` | — | 131 unindexed foreign keys, 253 "multiple permissive policies" warnings (every org table has a platform-admin policy beside the member policy), 27 unused indexes | Low | Open: question Q8 |
| 15 | Uploads: audit photos, candidate documents, fit notes, HR case evidence, staff documents (DBS etc.), complaint documents, Care Certificate evidence | manager / office | Upload a program renamed `.pdf`, an HTML page or an SVG | Refused | Stored as-is with whatever type the browser declared; only the size was checked (and audit photos had no size cap beyond the 4 MB action limit). Form uploads and the logo already checked types | Medium (security) | Fixed: `lib/upload-check.ts` on every handler + `tests/upload-check.test.ts` |
| 16 | Accessibility (axe, WCAG AA), console | all | Run axe on Today, Staff, Courses, Complaints, Assign training | No serious violations | Contrast under 4.5:1 on the readiness card's white-on-green at 60–80%, chip counts and hints at 70–80% muted, leaver rows at 60% opacity, locked badge cards; the account button's name ("Your account") did not contain its visible text ("PT"); the stars pill likewise (and its "0stars" ran together); the bulk-assign file input had no label; the Who's off dots carried an `aria-label` with no role | Medium | Fixed + `tests/e2e/a11y.spec.ts` |
| 17 | Accessibility, public site | visitor | axe on /, /training, /training/pricing, /contact, /verify | No serious violations | 14–18 contrast failures per page: ink colour at 40–65% opacity for body text and labels (3.0–4.4:1), the gold accent `#b7791f` as text and as a button background with white text (3.6:1), the sky link `#0284c7` (4.1:1), the footer version/links at 40%, the product monitor's address-bar label and the "CQC training in full" link in the service's own colour | Medium | Fixed: body text now at 70% of the ink colour, gold `#9a6414`, link `#0369a1` (a slightly darker gold on the public site — visible change, see Q9) |
| 18 | Top navigation, keyboard | all | Open a drop-down with Enter, Tab into it, press Escape | Panel closes and focus returns to the menu button | Panel closes but focus is dropped on the page (the next Tab starts from the top) | Low | Fixed + `tests/e2e/nav.spec.ts` |
| 19 | Internal links in emails, notifications, menus and pages | — | Every `/org`, `/learn`, `/platform`… string literal checked against the routes that exist | All resolve | All resolve (prefixes and image paths aside); the old URLs in `next.config.ts` redirect correctly; `/org/incidents` and `/org/forms/own` redirect to their new homes | — | OK |
| 20 | Secrets | — | Scan tracked files for key-shaped strings, `NEXT_PUBLIC_*` names, client components importing the admin client | None | None found; only `.env.example` and `.env.test.example` are tracked | — | OK |
| 21 | `/org` Today → "Who's off this week" | manager | Have someone on approved leave this week or off sick (seed: Lena Fakeholiday, Kai Fakesick) | They are listed with dots under the days | Always "Nobody is on leave or off sick this week": the card's `users(...)` join is ambiguous (three foreign keys to `users`), PostgREST answers PGRST201, the error is never read | High | Fixed (named joins) + test in `flows-people.spec.ts` |
| 22 | Any console page, first load after the Due count's 2-minute cache expires (seen on `/org/clients/[id]`) | manager / office | Open a page when the cached Due count is cold | Page renders | Intermittent "Something went wrong": `cookies()` can't be read inside `unstable_cache()` — the cached count called `loadAuditForms`, which opens a cookie-based client | High (intermittent, every console page) | Fixed (the cached count reads with its own client: the audit-form loaders and the service-audit form loaders take the client they are given) |
| 23 | QA harness | — | Run the QA server | No real email | `next start` reads `.env.local` itself, so the QA server picked up the live `RESEND_API_KEY` and tried to send real invitations (Resend answered 422) | High (harness) | Fixed: `scripts/qa/serve.mjs` blanks the email, AI and payment keys and logs the server's output to `test-results/qa-server.log` |
| 24 | `/learn/hr` "Ask for this leave", `/org/hr/holidays` "Add the leave", `/org/hr/absence` "Record the absence", `/org/hr/leavers` "Record that they're leaving" (phone) | manager, carer | Measure the submit button at 390px | ≥ 44px touch target | 40px (`Button size="sm"` is 40px on a phone; the default size is 44) | Low | Open (small; Q11: make `sm` 44px on touch screens?) |
| 25 | `/org/clients/new` | manager | Date of birth `1900-01-01` or `2999-12-31`, care started `2999-12-31` | A sanity check | Accepted silently | Low | Open |
| 26 | `/org/hr/absence` "Details (optional)" | manager | Paste 10,000 characters | A field limit or a message | Saved silently cut to 1,000 characters | Low | Open |
| 27 | `/org/learners/admin` bulk import | manager | Upload a CSV whose header isn't recognised | Refused up front, as the client import does | First two columns read as name/email, "0 invited, 1 failed" after the send | Low | Open (headerless files are deliberately allowed) |
| 28 | `/login?redirectTo=/\evil.com` (and `next=` on `/auth/confirm`) | any | Open the link, sign in | Stay on the site | The browser lands on evil.com: the check allowed anything starting with "/" except "//", and browsers read a backslash as a slash | High (open redirect) | Fixed: `lib/safe-path.ts` + `tests/safe-path.test.ts` |
| 29 | QA harness (follow-up to 23) | — | Run the QA server | No real email | Blanking the key was not enough: Next drops empty variables and then reads `.env.local`; a contact-form test **delivered a real enquiry to the inbox** (fake sender "Quinn Fakeenquirer", 2 Nov 2026) | Critical (harness) | Fixed: the QA server reads no env file at all, and `EMAIL_SENDING=off` stops every send in `lib/email.ts` |
| 30 | Every upload form (carer forms, complaint documents, Care Certificate evidence, audit photos, staff documents, fit notes, case evidence, candidate documents) | all | Attach a file over ~4 MB | A clear "too big" message | "Something went wrong" and the answers are lost: the server action's whole request is capped at 4 MB, so the handlers' own 10–20 MB checks never ran | Medium | Fixed: one 3 MB limit everywhere, checked in the browser before sending and on the server |
| 31 | Carer forms `lib/form-uploads.ts` (and every other upload) | carer | Attach a program renamed `.pdf` | Refused | Accepted: only the browser's declared type was checked, which follows the file name | Medium | Fixed: the first bytes must match the name (`checkUploadBytes`) |
| 32 | `/org/policies/[code]` editor, `/platform/organisations/[id]?section=settings` | manager, platform admin | Save draft / Save | "Saved." stays visible | The form re-mounts on save (keyed on content), so the confirmation flashes and goes; the save lands | Low | Open |
| 33 | Seed | — | Forms library | Carer forms assignable | Only the 12 logs existed: the seed skipped the 25 library forms because the logs satisfied its "already seeded" count | Medium (QA coverage) | Fixed (seeded by code) |
| 34 | Seed / `/org/certificates/pack` | manager | Download the certificate ZIP | ZIP | 404 "No certificates to download": seeded certificates have no stored PDF (they are rendered on issue in real use) | Low (seed gap) | Open: the pack is tested with certificates earned in the training flow |
| 35 | Session cookie | any | Sign in, inspect `sb-…-auth-token` | HttpOnly | `HttpOnly=false`, `SameSite=Lax`: the Supabase browser client sets it from JavaScript (the SSR package's design: the server refreshes it, the browser needs to read it) | Medium | Question Q12 |
| 36 | Sign-in throttling | — | 10 wrong passwords | Throttled | The app itself has no limiter on sign-in (only on password reset and the contact form); the hosted Supabase Auth rate limits sign-in per IP (30 per 5 minutes by default) — not verified from here | Info | Question Q13 |
| 37 | Empty states | manager of an empty company | Visit each list page | Wording + a primary action | Wording is helpful everywhere; `/org/certificates`, the Due tabs, `/org/observations` and `/org/courses/statistics` have no primary action (nothing to add there directly) | Low | OK / judgement |
| 38 | Public site accreditation wording | visitor | Search all 12 public pages for "accredited", "CPD", "CQC-approved", "approved by CQC", "certified" | None unless true | None found | — | OK |
| 39 | Due badge in the top bar (every console page) and the drop-down "n due" counts | manager | Compare the badge with Today's "things to fix" | Same count | Badge said "Due 2" (training only) while Today said 14, and no drop-down item showed a count: the cached count's to-do read failed under the service role — the same cookie-in-cache fault as finding 22 — and was swallowed | High | Fixed with 22 + `flows-training.spec.ts` |
| 40 | Compliance → Service audits count | manager | 19 audits due | "19 due" beside Service audits | Never shown: the to-do lines point at `/org/due/audits`, the menu item at `/org/audits` | Low | Fixed (the item also stands for `/org/due/audits`) |
| 41 | `/org/observations/[userId]` | manager | Mark standards competent, look for sign-off | Sign-off once everything is done | "Sign off & award" stays disabled with only "Complete all standards to enable." — correct, but nothing says which half (course or observation) is missing per standard | Low | Open (wording) |
| 42 | Seed / `/org/learners/stars` | — | Seeded quiz attempts | Count towards stars | They don't: the seed's attempts carry no question ids, so the stars view derives 0 (a real pass credited 10 stars correctly) | Info (seed) | Noted |
| 43 | Seed / Compliance → Spot checks & competency | — | Seeded overdue competency check in area `moving_handling` | Counted as late | Not counted: the to-do list and the Due badge only count the areas on the company's competency form (`medication`, `hoist`, `moving_people`…), so a check recorded in an area the form no longer lists never shows as late. Seed changed to `moving_people` | Info (seed; by design, as far as the code says) | Fixed (seed) |

## 6. Reads that stop at 1,000 rows (audit, 2 Nov 2026)

Supabase returns at most 1,000 rows for one request and drops the rest with
no error. `lib/fetch-all.ts` pages through everything and is used by the
scheduled jobs, the training matrix, the governance report, the evidence
pack, the certificate pack and the portal API, so those are safe. Every
`.range()` in the code base sits inside such a loop. Fixed in this review:
the weekly policy digest, organisation removal, the AI spend limit, and
sending a feedback round (findings 7–10).

Decision (Q6, Saj, 2 Nov 2026): every list is read in full and the page
shows the most recent 200 with a "View all N" link (`?all=1`), through
`lib/latest.ts` and `components/view-all.tsx`; exports, packs and pickers
always carry everything. Applied the same day (v3.11.7 onwards):

- Platform pages: organisations (and the CSV), issue reports, billing, tiers,
  analytics totals, bespoke-report queues and threads, the organisation
  page's people list.
- Per company: complaints and compliments (and their people pickers),
  performance plans, form records and assignments, form logs (screen and
  CSV/PDF), audits and QAs, feedback rounds, classroom sessions, face-to-face
  sessions and bookings, reminder history, the Care Certificate rollup, the
  company's bespoke reports list.
- Per person: form asks and responses, classroom attendance, supervisions,
  bookings, spot checks, competency, audit training, actions, letters,
  absences, leave, HR cases, concerns, compliments, a client's logs and
  compliments; the evidence PDF and ZIP; the leaver's training-record email.
- `.in()` lists go in groups of 100: classroom attendees, face-to-face
  picks, alert course titles, in-person completion, the actions page.

Caps that stay, each now said out loud: the certificate pack ZIP holds 400
files (the 60-second function limit) and carries a README listing what was
left out and where to get it; the leaver's email attaches the most recent
25 certificates and says so; the stars streak looks at the last 300 quiz
attempts; the HR summary tiles show the last few checks; the alert retry
job works in batches of 100. The staff rollup (`org_learner_rollup`) returns
one JSON value, so it has no row cap.

## 7. The redesign against the mock-ups (docs/redesign)

Compared at 1440px and 390px with the seeded QA Test Care data (sample names
and numbers in the mock-ups ignored). Screenshots: `node scripts/qa/screenshots.mjs <dir> [role]`.

| Mock-up | Matches | Differences / notes |
|---|---|---|
| 1 Today | Greeting, date and company; the four cards (readiness ring, Training complete %, Supervisions up to date x/y, Service audits due) with bars and a consequence line; Needs your attention with code tile, title, meta, pill and an inline Book/Start/Choose who button; Finish setting up (trial company only); Who's off this week; Training across the team bar | "You may also be interested in" (MyRoster / Yellowloaf) card is shown to paid companies too (TRIAL.md says every company — intended). The phone layout overflowed (finding 3, fixed). Mock-up's "Trial · 7 days left" pill only shows on a trial company (correct). |
| 2 Compliance menu | Panel with Staff checks / Service quality / Safety headings, two-letter tiles, one-line descriptions, footer line to the governance report | No "Incidents" item (the brief said skip); incidents live under "Incidents, complaints & safeguarding". Due-count badges per item appear when something is late. |
| 3 Staff list | Title + "N people · N need attention", Training matrix / Import / + Add staff buttons; segmented control All / Needs attention / Never signed in / Leavers; search + Filters; table Name (avatar, role), Training bar + %, Supervision pill, Appraisal pill, Last active, chevron; whole row links | Header count disagreed with the All chip (finding 5, fixed). On a phone the table did not scroll inside its card (finding 4, fixed). Role under the name comes from `staff_employment.job_title`, falling back to "Care worker"/"Manager". |
| 4 Staff profile | Breadcrumb, header card with avatar, name, role pill, email, start date; Remind / Evidence pack / Assign course / Book supervision; tabs Overview … More ▾; Overview compliance checklist (Mandatory training, Right to work & DBS, Policies read, Supervision, Appraisal, Profile details) with pill + one-click action; ring "3 of 6 checks done"; Recent activity | Matches. Right to work & DBS reads "Missing" until a document is uploaded. |
| 5 Phone | Logo + search + hamburger; stacked cards; attention list with arrow buttons | The trial strip under the bar appears for trial companies only. Mobile overflow fixed (findings 3–4); every console and carer page now fits 390px (`tests/e2e/mobile.spec.ts`). |
| 6 Stars (HTML mock-up) | Leaderboard under People → Staff → Stars; Stars tab on a person's file | Not re-compared in detail (built 2 Nov, v3.9.1). |

Menus: every old page is reachable from Today / Due / People / Training /
Compliance / Documents (`tests/e2e/nav.spec.ts`), each role sees only its
own items (a carer never sees the console menus), feature-gated items
disappear for a Growth company and direct visits land on `/org/locked/<feature>`.

## 8. Questions for Saj (decisions needed)

- **Q1–Q5** — roles, in §4.2.
- **Q6** — the remaining 1,000-row caps in §6: page the platform lists and the per-company registers, or show "latest N"?
- **Q7** — turn on leaked-password protection in Supabase (Auth → Passwords) and drop the `_bk_hg_cert_expiry_20260927` backup table from the live project?
- **Q8** — the performance advisor's unindexed foreign keys (131) and duplicate permissive policies (253): worth a migration adding indexes on the hot ones (`enrolments`, `certificates`, `audits`, `supervisions` by `organisation_id`/`user_id` are already indexed; most of the 131 are `created_by`/`updated_by` columns)?
- **Q9** — the public site's gold accent is now `#9a6414` (was `#b7791f`) and body text at 70% of the ink colour, so every text passes 4.5:1. Keep, or choose other shades?
- **Q12** — the session cookie is readable by JavaScript (`HttpOnly=false`), as the Supabase SSR package needs. Accept, or move sign-in to a server action so the server sets the cookie HttpOnly (the browser client would then only be used for MFA)?
- **Q13** — sign-in has no limiter in the app; the hosted Supabase Auth throttles per IP. Add an app-side limiter on the sign-in page (like the one on password reset) as belt and braces?
- **Q11** — `Button size="sm"` is 40px on a phone; the HR forms use it for their submit buttons. Make the small size 44px on touch screens?
- **Q10** — sessions: Supabase refresh tokens keep a session alive indefinitely while the app is used; nothing signs a manager out after a period of inactivity. Supabase has a "time-box sessions / inactivity timeout" setting (Pro). Wanted for console roles (e.g. 12 hours)?

## 9. Performance (Lighthouse, local production build, 2 Nov 2026)

| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT |
|---|---|---|---|---|---|---|
| `/` | 99 | 96 | 100 | 100 | 1.4 s | 21 ms |
| `/training/courses` | 100 | 96 | 100 | 100 | 1.4 s | 45 ms |
| `/login` | 92 | 100 | 100 | 69 (noindex by design) | 3.3 s | 40 ms |

Nothing to fix for size or blocking scripts; the only flagged items were the
contrast failures (now fixed) and a render-blocking stylesheet of ~0.5 s on
first load. Server-side, the heavy pages (Today, Staff, matrix) read with
`fetchAll` and the per-organisation rollup function; no N+1 pattern was found
in the pages checked (the audit in §6 covered every read).

UK dates and the clock change: `lib/dates.ts` formats everything in
Europe/London and `tests/dates.test.ts` / `tests/trial.test.ts` already cover
a timestamp either side of the 25 October 2026 change and a trial that spans it.

## 10. Final runs (2 Nov 2026, v3.11.6 and v3.12.5)

| Check | Result |
|---|---|
| `npm run lint` | clean (0 warnings) |
| `npx tsc --noEmit` | clean |
| `npm run build` | passes |
| `npm run test:qa` → Playwright | 896 passed, 0 failed (desktop 1440px and phone 390px projects: smoke, permissions matrix, cross-company isolation, page crawl, accessibility, navigation, phone widths, and the people, training and documents flows) |
| `npm run test:qa` → Vitest | 130 files, 983 tests passed |

After the decisions (§11) were applied, the suite was run again on that
build (v3.12.5): Playwright 915 passed (the 19 new tests cover the lists'
View all, the certificate pack's README and Who can see what), Vitest 133
files, 998 tests passed; lint, type-check and build clean.

Two earlier runs of the same suite each had one test fail with the local
stack's `An invalid response was received from the upstream server` (finding
12: the Dockerised PostgREST under four parallel browsers), on different pages
each time; the page answered correctly on retry. It is the local stack's
limit, not the app's, and does not happen on the hosted project.

## 11. Decisions applied (2 Nov 2026)

Saj answered the thirteen questions the same morning. What was done:

| Question | Decision | Done |
|---|---|---|
| Q1 trainer role | Leave it: office worker covers trainers | — |
| Q2 office workers and HR cases | Every office worker sees disciplinary and grievance cases; a "Who can see what" page under Settings lets a manager switch whole areas off for office workers | `can_see_hr_case()` rewritten (migration `20261102100423`), the named-list setting removed from Settings → HR → Disciplinary and grievance. The page is built (mock-up `docs/redesign/My-Care-Academy-7-Who-can-see-what.html`, agreed by Saj): 15 areas, all on by default, stored as `organisations.office_hidden_areas` (migration `20261102103251`); `requireConsole()` sends an office worker to `/org/managers-only` for a page in an area that is off, and the menu, search, Today's list, the Due badge and the case reminder emails leave it out. Server actions are not gated one by one: the check runs on the page the action was called from, and the data stays the company's own. `tests/e2e/access.spec.ts` |
| Q3, Q4 | Intended | — |
| Q5 platform admin inside a company | Leave it; a logged read-only "open as this company" mode if support ever needs it | — |
| Q6 1,000-row caps | Read everything, show the most recent 200 with View all | §6 |
| Q7 | Turn on leaked-password protection (Saj, in the dashboard); drop the backup table | Table dropped live and in migration `20261102100206` (49 rows, a copy of HG certificates from 27 Sep 2026 before the 12-month change; nothing read it) |
| Q8 | Index the hot foreign keys | Migration `20261102100418`: 49 indexes (every `organisation_id`, and the columns lists and joins look up); the 80-odd `created_by`-style author columns left alone |
| Q9 colours | Keep the new shades | — |
| Q10 inactivity | 12 hours for console roles | Saj, in the dashboard: Auth → Sessions (Pro plan) |
| Q11 small buttons | 44px on phones | `components/ui/button.tsx` |
| Q12 cookie | Accept | — |
| Q13 sign-in limiter | Rely on Supabase's | — |

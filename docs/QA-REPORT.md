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
| `npm test` (Vitest) | see §2.1 — the suite in the repo runs against the **live** project (`tests/helpers.ts` loads `.env.local`), so it was not run as-is; it is re-run against the local stack in §8. |

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

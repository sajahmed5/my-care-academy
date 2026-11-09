# Test checklist — 27 Oct 2026 (live v2.24.3), re-checked 9 Nov 2026 (v3.16.1)

Test on **Demo Care Ltd**: every feature is switched on there. Sign in as
`qa-admin@demo-care.test` (manager) and, in a second browser or private
window, `qa@demo-care.test` (carer). HG Care only has training and the portal
link switched on, so most of this won't show there.

Checked on 26 Oct: build, type-check and all 457 tests pass. All 35
console pages and the carer pages load without errors. Database permissions
on the new tables are correct. The flows marked ✅ were run end to end with
test data, which has since been deleted, so Demo Care is clean.

**Re-checked 9 Nov 2026 against the code, the Vitest and Playwright suites
and `docs/QA-REPORT.md` (the 2 Nov full review).** The console has been
redesigned since this list was written: there is no sidebar, so the places
named below are now the top-bar menus Today / Due / People / Training /
Compliance / Documents, and Account is Settings (`/org/settings`). A box is
ticked where the flow was run by hand on 27 Oct or is now covered by an
automated test; a box left open says what is still missing. Struck-through
items no longer apply. "e2e" means a Playwright test in `tests/e2e/`.

---

## Quality

- [x] ✅ **Audits** — Compliance → Service audits → "Carry out an audit"
  (medication, care plan or infection control). Answer the questions, mark one
  **No** and give it an owner → "Sign off and save".
  Expect: a score (e.g. 90% met), the next due date, and the "No" listed under
  *Actions from this audit*. The owner sees it on **My actions** (carer:
  My HR → My actions, /learn/actions). A "No" with *no owner — note it only*
  is only noted, not turned into an action.
  *9 Nov:* run by hand on 27 Oct and now e2e ("a medication audit for a client:
  a No with an owner becomes an action", `flows-training.spec.ts`), plus
  `tests/audits.test.ts` and `tests/service-audits.test.ts`.
- [ ] **Due → Service audits** — the audit you ran shows its last and next due
  dates (`/org/due/audits`).
  *9 Nov:* built; the date logic is unit-tested (`tests/service-audits.test.ts`)
  but nothing has checked that a freshly run audit appears on the Due page.
  A one-minute manual look, or add an assertion to the audit e2e.
- [x] ✅ **Feedback surveys** — Compliance → Feedback → choose client or staff →
  "Start the round" (a client round can be named or anonymous). Open the link
  in a private window (no sign-in needed), answer and Send.
  Expect: "Thank you — your answers have been sent." Back in the console you'll
  see 1 response, an average for each question and a month-by-month line.
  Try **Close this round**: the link should then stop taking answers.
  *9 Nov:* run by hand on 27 Oct and now e2e ("a round is started, answered
  through its public link signed out, and counted"); averages and the trend in
  `tests/feedback.test.ts`. Closing a round has no automated test, but the
  closed-round refusal is in `app/survey/[token]/actions.ts`.

## Training

- [ ] ✅ **Classroom sessions** — Training → Face-to-face & classroom → Classroom
  → Record a session. Pick a course, tick who attended → Save session.
  Expect: the session appears in the list. Each attendee has that course
  *Completed* with a certificate, on their carer file and in the matrix.
  *9 Nov:* run by hand on 27 Oct, but the flow has changed since: each
  attendee now needs a **practical result**, and only those who passed get the
  completion and certificate (`app/org/classroom/actions.ts`,
  `lib/in-person-completion.ts`). No automated flow test, so this wants one
  more manual run with a pass and a fail. The form still stays open after
  saving (problem 3 below) — say if you'd rather it closed.
- [ ] Record one with **no course** ("— none: record it on their file only —")
  — it should show only on their file, with no certificate.
  *9 Nov:* built, never run and no test.

## Policies

- [x] ✅ **Adopt → complete → publish** — Documents → Policies → pick one →
  *Adopt and complete*. The banner counts the guidance notes and [fill-ins]
  left. **Publish to staff** stays greyed out until that count reaches 0.
  Write over the parts or use *Remove this part*, then *Save draft* and
  *Publish to staff*.
  Expect: the carer sees it under Policies, ticks *I have read and accepted
  this*, and shows as "Accepted — version 1". The manager's page
  (`/org/policies/people`) lists who has accepted.
  *9 Nov:* e2e, both halves (`flows-documents.spec.ts`: "manager adopts a
  library policy…" and "carer reads and accepts it…").
- [x] Publish a **new version** ("Publish new version"): every carer should be
  asked to accept again.
  *9 Nov:* e2e ("publishing a new version asks the carer again; Due → Policies
  lists its review") and `tests/policy-reading.test.ts`.
- ~~The add-on pack's **Complaints Policy** now shows complaints text (it was the Safeguarding Policy until v2.24.3).~~
  *No longer applies:* the add-on pack was retired on 31 Oct (migration
  `20261031130000_policy_library_one_pack`); the library is one pack and the
  single "Complaints" policy (`MCA-DOM-COMPLAINTS-POLICY-BBBA`) carries the
  complaints text.

## Forms

- ~~**58 converted Word forms** — Platform → Forms. They're drafts waiting for you to review and publish; staff can't see them until you do.~~
  *No longer applies:* the drafts were reviewed by code. `scripts/seed-library-forms.mjs`
  publishes the 25 library forms in `scripts/library-forms.json` (15 client,
  10 company) and the 12 logs, and retires the other 34 (`FORMS.md`). Platform
  → Forms should show those 37 published, not 58 drafts.
- [x] **File upload on a form** — assign a form that has an upload field to the
  carer. Complete it with a photo or PDF attached. Open the response as
  manager → *View file*.
  *9 Nov:* e2e with a QA fixture carer form ("carer completes it: a 10 MB file
  is refused, a small PNG is accepted", "manager reads the response back…"),
  plus `tests/upload-check.test.ts` (QA findings 15, 30, 31). None of the 25
  published library forms is a carer form with a file field — the six with
  one are client or company forms — so use a company-built form.
- [ ] **Completed forms in the evidence pack** — the carer file → *Evidence
  pack* button (there is no Evidence tab now) → Download pack → the PDF has a
  *Completed forms* section; the file also has a Forms tab.
  *9 Nov:* built (`lib/evidence-pack.ts`), section logic in
  `tests/evidence-pack.test.ts`; the e2e pack test checks only the name and
  company. Nothing has confirmed a form shows in the PDF — one manual download.
- ~~**Form builder** — edit a form: there's one *Save changes* button.~~
  *No longer applies:* that builder (`app/org/forms/[id]/form-builder.tsx`) was
  deleted. Its replacements each have one button: Settings → Forms → own form
  editor ("Save") and Platform → Forms → template editor ("Save form").

## Staff records

- [ ] **Staff documents** — carer file → Documents → upload one (e.g. a DBS
  certificate) with an expiry date. It should show with the date and count
  towards Due → Staff documents (`/org/hr/documents`) and Today.
  *9 Nov:* built; expiry/missing logic in `tests/staff-documents.test.ts`; no
  upload flow test and the QA seed has no staff documents. One manual upload.
- [ ] **Evidence ZIP** — carer file → Evidence pack → *Source files (ZIP)*. It
  should contain their certificates, documents and uploads.
  *9 Nov:* built (`app/org/staff/[userId]/evidence/files/route.ts`) with the
  folders Certificates, Staff documents, Recruitment documents and Care
  Certificate; the e2e test checks it is a ZIP naming the carer, not the
  folders. **Gap:** the files a carer attached to forms (`form-uploads`) are
  not in the ZIP, so "uploads" is only half true — decide whether they belong.
- [x] **Supervision signature** — the carer signs on the manager's screen while
  the supervision is recorded (since v2.19.1; there is no "carer opens it later
  and signs" step, and never was at v2.24.3). The manager's view shows both
  signatures, or the reason the carer didn't sign.
  *9 Nov:* e2e ("holding an overdue supervision, signed by both…") and
  `tests/supervisions.test.ts`.
- [x] **Due** — the top-bar Due menu: Training, Supervisions, Appraisals, Spot
  checks, Competency, Service audits, Policies, Staff documents.
  *9 Nov:* every tab load- and permission-checked (`routes.ts`, crawl and
  permissions specs), reachable from the menus (`nav.spec.ts`), appraisals,
  spot checks and competency exercised in `flows-training.spec.ts`.
- [ ] **PIPs** — Compliance → Performance plans: only the earliest open week is
  shown to work on.
  *9 Nov:* built (`pip-view.tsx` opens the first unreviewed week that has
  started); the e2e plan test reviews each week but doesn't assert that only
  one is open. Quick manual look.
- [ ] **Standing actions** — on an incident, complaint or safeguarding record,
  an owned standing check can be marked *Not needed* (with a reason).
  *9 Nov:* built (`markNotNeededAction`, `app/org/complaints/actions.ts`); no
  test covers the not-needed path. Quick manual check.

## Account and platform

- [ ] **Logo (white-label)** — Settings → White label (manager only, Enterprise)
  → upload a logo. It should appear in the top bar, on certificates and on
  policy pages.
  *9 Nov:* built (`app/org/settings/white-label`; used by `top-nav.tsx`,
  `lib/certificate.tsx`, the policy pages and the evidence PDF); only the email
  branding is tested (`tests/email-brand.test.ts`). Never run by hand: upload
  one on Demo Care and look at the three places.
- [x] **Rostering portal (myroster)** — Platform → Organisations → HG Care →
  Integration tab. The key is there and *last used* updates when the portal
  syncs.
  *9 Nov:* e2e ("issue an integration key, use it, revoke it" and "the portal
  API answers only to its own key"). **Changed:** since 29 Oct an Enterprise
  manager can issue, replace and revoke their own company's key under Settings
  → Integration, so "only platform admins" no longer holds. *Last used* is
  written by `lib/portal-api.ts` but not asserted by a test.
- [x] **Remove organisation** — only test this on a **throwaway**
  organisation. Suspend it first, then type its name back to remove it. It
  deletes the organisation's people, records and files permanently.
  *9 Nov:* e2e ("remove the organisation (suspended first, name typed back)");
  paged reads since QA finding 8.
- [ ] **CSV bulk assign / suggested training** — Training → Assign training →
  bulk assign from a CSV, and the suggested training on an incident record
  (`/org/incidents` now redirects to Incidents, complaints & safeguarding),
  both email the carers.
  *9 Nov:* the assignment is e2e ("Bulk assign from a CSV…") and the email text
  is in `tests/assignment-email.test.ts`, but the QA server runs with
  `EMAIL_SENDING=off`, so nothing proves an email leaves either flow. One
  manual assignment to a test address.

---

## Problems found tonight (27 Oct)

1. **The add-on pack's "Complaints Policy" was actually the Safeguarding
   Policy.** Fixed in v2.24.3, and the add-on pack itself was retired on
   31 Oct. The Word file in OneDrive
   (`Add On Packages/Complaints and Safeguarding Pack/Complaints Policy.docx`)
   still needs correcting (Saj) — nothing in the code can tell.
2. **Two "QA Org Admin" people in Demo Care** (`qa-org@demo-care.test` from
   July and `qa-admin@demo-care.test` from August). Not a fault, but both
   appear in staff pickers. Data only; still there unless one was removed.
3. **Classroom form stays open after saving.** Still so on 9 Nov
   (`record-session.tsx` resets the ticks, not the panel). Only about how it
   feels.

## Not built (on purpose)

- The 23 spreadsheet logs: 12 were built another way on 31 Oct (migration
  `20261031120300_form_logs`, `/org/forms/logs`); the rest were deliberately
  not repeated as logs. The local branch `wip/library-logs` (26 Oct) is
  overtaken and can be deleted.
- Stripe billing: still parked. The July code is there; no Stripe keys on
  Vercel (`ROADMAP.md`).
- Leaked-password protection: a setting in the Supabase dashboard (Auth →
  Passwords). **Still off on 9 Nov 2026** (live security advisors) — it was
  agreed on 2 Nov (QA-REPORT Q7) that Saj would switch it on.

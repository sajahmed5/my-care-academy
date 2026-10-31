# Test checklist — 27 Oct 2026 (live v2.24.3)

Test on **Demo Care Ltd**: every feature is switched on there. Sign in as
`qa-admin@demo-care.test` (manager) and, in a second browser or private
window, `qa@demo-care.test` (carer). HG Care only has training and the portal
link switched on, so most of this won't show there.

Checked tonight (26 Oct): build, type-check and all 457 tests pass. All 35
console pages and the carer pages load without errors. Database permissions
on the new tables are correct. The flows marked ✅ were run end to end with
test data, which has since been deleted, so Demo Care is clean.

---

## Quality

- [ ] ✅ **Audits** — sidebar → Audits → "Run one" (medication, care plan or
  infection control). Answer the questions, mark one **No** and give it an
  owner → Save.
  Expect: a score (e.g. 90% met), the next due date, and the "No" listed under
  *Actions from this audit*. The owner sees it on **My actions** (carer:
  /learn/actions). A "No" with *No owner* is only noted, not turned into an
  action.
- [ ] **Who's due → Audits** — the audit you ran shows its next due date.
- [ ] ✅ **Feedback surveys** — sidebar → Feedback → choose client or staff →
  Create survey link. Open the link in a private window (no sign-in needed),
  answer and Send.
  Expect: "Thank you". Back in the console you'll see 1 response, an average
  for each question and a month-by-month line. Try **Close this survey**: the
  link should then stop taking answers.

## Training

- [ ] ✅ **Classroom sessions** — Learners → Classroom sessions → Record a
  session. Pick a course, tick who attended → Save session.
  Expect: the session appears in the list. Each attendee has that course
  *Completed* with a certificate, on their carer file and in the matrix.
  (The form stays open after saving, ready for the next session. Say if
  you'd rather it closed.)
- [ ] Record one with **no course** — it should show only on their file, with
  no certificate.

## Policies

- [ ] ✅ **Adopt → complete → publish** — sidebar → Policies → pick one →
  *Adopt and complete*. The banner counts the guidance notes and [fill-ins]
  left. **Publish to staff** stays greyed out until that count reaches 0.
  Write over the parts or use *Remove this part*, then *Save draft* and
  *Publish to staff*.
  Expect: the carer sees it under Policies, ticks *I have read and accepted
  this*, and shows as "Accepted — version 1". The manager's page lists who
  has accepted.
- [ ] Publish a **new version**: every carer should be asked to accept again.
- [ ] The add-on pack's **Complaints Policy** now shows complaints text (it was the Safeguarding Policy until v2.24.3).

## Forms

- [ ] **58 converted Word forms** — Platform → Forms. They're drafts waiting for
  you to review and publish; staff can't see them until you do.
- [ ] **File upload on a form** — assign a library form that has an upload
  field to the carer. Complete it with a photo or PDF attached. Open the
  response as manager → *View file*.
- [ ] **Completed forms in the evidence pack** — the carer file → Evidence →
  the form appears under *Forms*.
- [ ] **Form builder** — edit a form: there's one *Save changes* button.

## Staff records

- [ ] **Staff documents** — carer file → Documents → upload one (e.g. a DBS
  certificate) with an expiry date. It should show with the date and count
  towards *Who's due*.
- [ ] **Evidence ZIP** — carer file → Evidence → download files (ZIP). It
  should contain their certificates, documents and uploads.
- [ ] **Supervision signature** — record a supervision, then as the carer open
  it and sign. The manager's view should show the carer's signature.
- [ ] **Who's due** — sidebar → Who's due → Supervisions / Spot checks / Audits.
- [ ] **PIPs** — only the earliest open week is shown to work on.
- [ ] **Standing actions** — an owned action can be marked *Not needed*.

## Account and platform

- [ ] **Logo (white-label)** — Account (manager only) → upload a logo. It
  should appear in the sidebar, on certificates and on policy pages.
- [ ] **Rostering portal (myroster)** — Platform → Organisations → HG Care →
  Integration tab. The key is there and *last used* updates when the portal
  syncs. Only platform admins can issue or revoke keys.
- [ ] **Remove organisation** — only test this on a **throwaway**
  organisation. Suspend it first, then type its name back to remove it. It
  deletes the organisation's people, records and files permanently.
- [ ] **CSV bulk assign / incident training** — assigning training this way
  now emails the carers.

---

## Problems found tonight

1. **The add-on pack's "Complaints Policy" was actually the Safeguarding
   Policy.** Fixed in v2.24.3: it now carries the Domiciliary Care Complaints
   Policy. The Word file in OneDrive
   (`Add On Packages/Complaints and Safeguarding Pack/Complaints Policy.docx`)
   still needs correcting (Saj).
2. **Two "QA Org Admin" people in Demo Care** (`qa-org@demo-care.test` from
   July and `qa-admin@demo-care.test` from August). Not a fault, but both
   appear in staff pickers.
3. **Classroom form stays open after saving.** It works; this is only about
   how it feels.

## Not built (on purpose)

- The 23 spreadsheet logs: paused for your review. The groundwork is saved
  on the local branch `wip/library-logs`.
- Stripe billing: parked.
- Leaked-password protection: this is a setting in your Supabase dashboard
  (Auth → Passwords).

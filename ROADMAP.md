# What we are building next (ROADMAP.md)

> Agreed with Saj, 23 Oct 2026, after the carer file shipped. `CARER-FILE.md` holds the spec for
> what is already built; this is what comes after it, in order, with the decisions that shape
> each piece. Everything here is agreed in principle — "build it and we can amend after if it
> doesn't work".

---

## 1. The policies & procedures library

**Sold already.** `documents.library` is in Growth and above and `documents.compliance_pack` in
Pro and above, and the public pricing page lists both. Nothing exists behind them. This is the
most urgent item for that reason alone.

**The content exists.** `HG Care - Share Drive / HG Policies & Procedures /` in Saj's OneDrive:
thirteen category folders (Care Practice, Rights and Abuse, Risk Assessment & Care Planning,
Admission, four HR, three Administration, Quality Assurance, Health and Safety), ~70 documents in
Care Practice alone. Every file carries a code, issue, version and updated date —
"CC12 Infection Control Policy and Procedure, Issue 3 Version 5, Updated 21/09/2026" — which is
most of the metadata a library needs.

**Branding, decided:** the master library is **My Care Academy**, not HG Care. An organisation
with white-label gets **its own name** in place of ours.

That decision is what makes the build non-trivial, because the documents are PDFs with the
company name set in the text. Three ways, cheapest first:

1. **Stamp** — keep the PDF, overlay the organisation's name and logo on a generated cover page.
   Fast; the body text still says someone else's name.
2. **Merge field** — hold a `.docx` master per policy with `{{organisation}}`, render to PDF per
   organisation on demand. Correct text; needs the Word masters, which may not exist.
3. **Structured content** — extract each policy into content blocks in the database (the same
   shape courses already use) and render per organisation with their name and logo. The real
   answer, reusable, and the only one that makes policies searchable and versionable in-app.
   Also the most work, and extraction has to be checked by a human because these are regulatory
   documents.

**Decided: structured content** (Saj, 23 Oct 2026), and **imported** — `policy_documents`,
`scripts/import-policies.mjs`.

**The source is our own pack**, not HG Care's internal policies: `HG Care - Share Drive /
My Care Academy`, whose folders are the product already — Domiciliary Care and Residential Care
Home, each with a CQC Basic set and a Full Compliance Pack, plus add-on packs for complaints and
recruitment. 129 documents are in: 43 policies, 63 forms, 23 spreadsheet logs.

Three things follow from what the documents actually are:

- **They are templates, not finished policies.** They carry `[ORGANISATION NAME]` (now
  `{{organisation}}`) and bracketed guidance for the provider to complete — 1,133 guidance
  paragraphs across the library, kept and marked so the UI can show them as something to fill in
  rather than as policy text. So the model is not "read our policy and accept it": an
  organisation **adopts and completes** a template, and its staff acknowledge **their** version.
  That means an `organisation_policies` table holding their copy, with acknowledgements pointing
  at it. **Built (v2.21.0):** adopt, complete (publishing waits until no guidance or [fill-in]
  is left), publish as a version; staff read and accept only published copies.
- **A library that mixes policies with blank forms teaches people to scroll past both**, so
  every row carries a `kind`. Forms and logs want downloading and printing; policies want
  reading and accepting.
- **Several of these are paper versions of what the platform now does** — the Complaints Log,
  the Staff Training/Supervision/DBS Record, the Spot Check Form, the Medication Competency
  Observation. Worth deciding which we ship as a spreadsheet and which we point at the feature
  that replaces it.

Two content problems found in the share drive, both in the add-on pack:

- `Complaints and Safeguarding Pack/Safeguarding Policy Domiciliary Care.docx` is **not a
  policy**: it is a copy of the Incident, Safeguarding and Notifications Log spreadsheet saved
  with a .docx name. It is the only file the importer could not read.
- Which leaves that pack **with no safeguarding policy at all**, though Domiciliary Basic,
  Domiciliary Full and Residential Full each have one.

Everything lands as `draft`; nothing reaches a customer until it has been read back.

**What makes it worth the money:** not the files, but **"who has read and accepted this
version"**. Acknowledgement turns a library into evidence, and it feeds the carer file and the
evidence pack.

**Built 23 Oct 2026** (v2.13.5): `/org/policies`, with a **Policies** tab and a **Documents**
tab, because a policy is read and accepted while a form is downloaded and filled in. The reader
sees the organisation's own name where `{{organisation}}` was, the bracketed guidance marked as
guidance with a count of how many parts are still to write, and — on policies — "I have read and
accepted this", recorded against the person who clicked it and the version they read. Which
packs an organisation sees follows its entitlements: the CQC basics with `documents.library`, the
full pack with `documents.compliance_pack`, and an add-on pack with the feature it belongs to, so
the complaints pack arrives with the complaints register.

**The platform side is built too** (v2.13.6): `/platform/documents` lists all 129 with pack,
type and status, leads with the ones worth a look (no content, no organisation name, oddly
short), previews each one as a sample organisation would read it with its source file shown, and
publishes, withdraws or retires a document — or a whole pack at once, scoped by pack and type so
"publish the policies, leave the forms" is one action. Every status change is audited. The 43
policies are published; the 63 forms and 23 logs are drafts.

**Carers can read and accept** (v2.13.7): `/learn/policies`, in the learner nav when the
organisation has the feature, leads with what is still to accept and tucks the accepted ones
away. The acceptance is the carer's own — the insert runs as them and the table permits no other
row. **Managers see who has accepted**: "12 of 40 accepted" against each policy in the library,
and on each policy the list of who has not, with anyone who accepted an older version shown as
outstanding and their old acceptance stated for what it is.

Still to do here: downloading the actual file (the spreadsheet logs have nothing to give yet —
they need the files in storage), an organisation's own completed copy of a template, policy
acceptances in the carer file and the evidence pack, the duplicate titles across packs (set each
organisation's service type; show only the full-pack version of a title the basics also carry),
and an importer that leaves published text alone on re-run.

---

## 1b. The forms library

Decided 24 Oct 2026 and **built** (v2.13.9): the forms feature had shipped as a builder — a
manager made forms from three code templates and, because the fill page required `org_admin`,
filled them in on the carer's behalf. That is the wrong way round. We make the forms; companies
use them.

- **Authored centrally**, at `/platform/forms`: title, category (recruitment, quality, reviews,
  care, HR, other), pack, and the fields — the builder's own field model, so conditionals and
  required flags carry over. Saving changed fields bumps the version.
- **Assigned by an organisation**, at `/org/forms` → a form → "Ask someone to complete it":
  everyone or a picked few, a due date, a note. Someone who already has it open is skipped.
- **Completed by the carer** on their own login at `/learn/forms`, validated against the fields
  they were shown (a hidden conditional question is never required), with a typed name as the
  signature. The response is the carer's own row; a manager cannot write one.
- **In the task list and the carer file**: an open ask is a task — "Complete Supervision record,
  due 1 Nov" — and the file's Forms section shows what was asked and what was done.

The three builder templates were seeded as the first published forms. The old builder still
exists under `/org/forms/own` for anything bespoke.

Done since: file uploads on a library form (v2.20.0), responses in the evidence pack (v2.20.1),
reading a submitted response in full (v2.17.5), and the Word forms converted into 58 draft
fillable forms (v2.24.1, `scripts/convert-word-forms.mjs`) — each to be read through and
published in `/platform/forms`. The 23 spreadsheet logs are still to do.

## 2. White-label

Decided: an organisation uploads its own logo **on its own profile**, and it then appears on
their certificates, their learners' portal, and their copy of the policies.

**Built (v2.18.7–v2.18.8).** A manager uploads the logo on the Account page (PNG or JPEG, under
512 KB, into the public `org-logos` bucket); `lib/branding.ts` shows it on new certificates, in
the portal's sidebar and header, and on their copy of each policy — only while the package
includes white-label.

---

## 3. Finish what is part-built — done, 25 Oct 2026

- **Current staff compliance** (v2.19.3). Right to work, DBS, references and business car
  insurance on the carer's file (`staff_documents`), with expiries and missing items in their
  task list, and their application documents listed beneath.
- **The organisation-wide "what's due" view** (v2.19.2). "Who's due" in the menu:
  `/org/due/supervisions` and `/org/due/spot-checks`, each gated on its own feature.
- **The supervision signature** (v2.19.1). Signed on the manager's screen, or a reason recorded.
- **The evidence pack's source files** (v2.19.0). A ZIP beside the PDF, on its own route.
- **Mobile** (v2.18.9). The carer file's sections stack as an accordion on a phone.

Also done the same day: the **rostering integration** for any myroster.care customer (v2.18.5–
v2.18.6). The portal API now requires `platform.portal_api`, and platform admins issue,
replace and revoke an organisation's key from its Integration tab.

---

## 4. The next products — built, 26 Oct 2026

Agreed to build, and to adjust once they are in use. All three are in, under a new **Quality**
category for the first two (`quality.audits`, `quality.feedback`, ticked into Pro and Enterprise):
audits at `/org/audits` (v2.23.0), feedback surveys at `/org/feedback` with public links at
`/survey/<token>` (v2.24.0), and classroom sessions at `/org/classroom` (v2.22.0).

- **Audits on a schedule** — medication, care plan, infection control. Templated, recurring,
  findings become actions. The same engine as spot checks, pointed at the service rather than a
  person.
- **Client and carer feedback** — survey links to families, service users and staff, with results
  trended. Nothing in the platform captures what people say about a provider today, and
  inspectors ask.
- **Classroom and blended training records** — a provider's own trainer logs a face-to-face
  session, and it lands in the same training matrix as the e-learning. This is what lets us sell
  to organisations that do not want our courses.

---

## 5. Review intervals, decided

Defaults, not rules — an organisation sets its own, and every form lets the date be changed
before saving (`REVIEW_INTERVAL_MONTHS` in `lib/records.ts`).

| Review | Default |
|---|---|
| Supervision | every 3 months |
| Spot check / competency | every 3 months |
| Client quality check | every 3 months |
| Carer satisfaction | every 6 months |
| Anything else added later | every 6 months |

**Retention, decided (Saj, 26 Oct 2026):** there is no retention period. Records are kept for as
long as the organisation uses the platform, and removed when it leaves — a platform admin
suspends it, then uses Remove organisation on its Settings tab (`lib/org-removal.ts`), which
deletes its accounts, records and files. `tests/user-erasure.test.ts` still has to cover every
new table, for a single carer's erasure.

---

## 6. Stripe

Parked. The original account is closed and every `STRIPE_*` variable was deleted from Vercel and
the local env files on 23 Oct 2026. When a new account exists: prices to match the published
£49 / £99 / £149 / £249, and HG Care's dead `stripe_customer_id` to clear.

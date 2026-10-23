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
  at it. Not built.
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

Still to do here: downloading the actual file (the spreadsheet logs have nothing to give yet —
they need the files in storage), and an organisation's own completed copy of a template.

---

## 2. White-label

Decided: an organisation uploads its own logo **on its own profile**, and it then appears on
their certificates, their learners' portal, and their copy of the policies.

`organisations.white_label_logo` exists in the database and **nothing reads or writes it**, so
this is an upload, storage, and three render sites.

---

## 3. Finish what is part-built

- **Current staff compliance.** The recruitment tracker covers candidates only. Right to work,
  DBS, references and insurance for *existing* staff, with expiries feeding the task list.
- **The organisation-wide "what's due" view.** Supervisions and spot checks can only be reached
  inside one carer's file. A manager works from "who is due this month", and it is most of the
  Pro pitch.
- **The supervision signature.** Carers never read their own record; they sign it at the time, on
  the manager's screen, while it is being completed (`CARER-FILE.md` §9). The signature is the
  one part of that decision the code does not yet implement.
- **The evidence pack's source files** — the ZIP of certificates and uploaded documents that
  travels with the PDF. It needs its own route; the 60-second function limit is why it is not in
  the pack route.
- **Mobile**: the carer file's tabs scroll sideways on a phone instead of stacking.

---

## 4. The next products

Agreed to build, and to adjust once they are in use.

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

**Still open: retention.** How long a supervision, spot check or complaint is *kept*, and what
happens at the end of it — a different question from how often it recurs.
`tests/user-erasure.test.ts` has to cover every new table whatever the answer.

---

## 6. Stripe

Parked. The original account is closed and every `STRIPE_*` variable was deleted from Vercel and
the local env files on 23 Oct 2026. When a new account exists: prices to match the published
£49 / £99 / £149 / £249, and HG Care's dead `stripe_customer_id` to clear.

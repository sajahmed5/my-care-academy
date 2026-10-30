# Service audits — agreed plan (29 Oct 2026)

Agreed with Saj on 29 Oct 2026. Service audits are in Pro and up (see
PACKAGES.md), all on `quality.audits`.

## Built

- **Editable audits, client by client** (30 Oct 2026, migration
  20261031110000) — each audit is a form (`lib/service-audits.ts`): ours
  (medication, care plan, infection control) with a company's changes laid
  over them in `service_audit_forms`, and its own audits, for one client at a
  time or the whole service. Question types: yes / no / N/A, rating 1–5, free
  text, photo (shrunk on the phone, kept in the private
  `service-audit-photos` bucket). Medication and care plan audits link to a
  client and are due client by client (medication only where the company
  helps with medicines) at `/org/due/audits`. Signed off by the auditor; a
  score below the company's level (`service_audit_settings`, 80% by default)
  waits for a manager's review. Set up under `/org/settings/service-audits`,
  managers only. An audit keeps the questions it was asked (`audits.items`);
  the one audit from before keeps `answers`.
- **Client QAs** (30 Oct 2026, migration 20261031111000) — `client_qas`, at
  `/org/audits/qa/new` (`lib/client-qa.ts`): visit or phone, with the client
  or a family member, or why it couldn't be done (still counts as attempted);
  1–10 under Safe, Effective, Caring, Responsive, Well-led (the score is
  their average × 10); medication questions only for clients helped with
  medicines; the company's own questions; well / better / action plan, with
  actions on the task list (`record_actions` source `client_qa`). Due client
  by client, every 3 months by default; the medication and own questions and
  the period are edited under Settings (`service_audit_forms` key
  `client_qa`). From a QA in one click: praise to the compliments log, linked
  to the carers ticked; a problem raised as a concern waiting for triage,
  which links back (`client_qas.complaint_id`, shown on the concern).

## Today

`/org/audits` (`lib/audits.ts`, migration 20261026130000): three audits —
medication (monthly), care plan (every 3 months), infection prevention and
control (every 3 months). Each is a fixed list of yes / no / not applicable
questions, with a percentage score, and every "no" becomes an action with an
owner and a date. That last part stays as it is.

What's missing: the questions are fixed in code, so a company can't edit them
or add its own audit; the client an audit is about is a name typed in; and
there's no client QA.

## Client QAs

New. MyRoster's client QA form (`src/lib/formTemplates/seeds.ts`,
`clientQaSchema`) is the starting point:

- How it was done (a visit or a phone call) and who with (the client, or a
  family member and their relationship).
- If it couldn't be done, why — it still counts as attempted.
- A rating of 1–10 under each of CQC's five headings: Safe, Effective, Caring,
  Responsive, Well-led.
- Medication questions, shown only for a client the company helps with
  medicines.
- What do we do well? What can we do better?
- An action plan for the office.

One per client, every 3 months by default, in Who's due client by client.

**From a QA, in one click:** praise goes to the compliments log, linked to the
carer it's about; a problem is raised as a concern (COMPLAINTS-SAFEGUARDING.md),
which links back to the QA.

## Client audits

The **medication** and **care plan** audits link to a client from the client
list and are due client by client: medication monthly, care plan every 3
months, both editable. Medication audits are only due for clients the company
helps with medicines.

## Service-wide audits

- **Infection prevention and control** — as today.
- **Staff file audit** — filled in automatically from the HR pack: DBS and
  right to work in date, references held, probation done. The auditor checks
  and signs it off.
- **Training compliance** — filled in automatically from the training records.
- A company can add its own.

## How they all work

- **Editable.** Every audit's questions and how often it's due start from our
  defaults and can be changed. A company can add its own audits. Question
  types: yes / no / not applicable, rating, free text, and photo.
- **On a phone**, in a client's home.
- **Signed off** by the auditor. Scores and actions as today.
- **Manager review.** An audit or QA scoring below a level the company sets
  (80% by default) waits for a manager to review it — showing CQC that
  results are looked at, not just filed.
- **Who does them.** Managers and office.

## The client page

One page per client: their QAs, audits, concerns and compliments over time.

## Monthly governance report

One PDF for CQC's well-led questions: audits done and their scores, QA
ratings by heading, actions still open, concerns, and training compliance.
An optional AI summary at the top, at 1.5 times cost.

# Service audits — agreed plan (29 Oct 2026)

Agreed with Saj on 29 Oct 2026. Nothing below is built yet beyond what's
marked as today's. Service audits are in Pro and up (see PACKAGES.md).

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

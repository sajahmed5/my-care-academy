# Complaints & safeguarding — agreed plan (29 Oct 2026)

Agreed with Saj on 29 Oct 2026. Nothing below is built yet beyond what's
marked as today's. Complaints & safeguarding is in Pro and up (see
PACKAGES.md).

## Built

- **One front door** (29 Oct 2026, migration 20261029213100) — "Raise a
  concern" at `/org/complaints/new`; the type is chosen then or left for
  triage (CON- references until triaged, kept after). Five types, each with
  its own stages; accident and near miss have a report and an actions stage
  with suggested training. "Change type" moves an open record. The incidents
  register is merged in: `/org/incidents` redirects, its rows are copied by an
  idempotent statement in the migration (re-run it after release to catch
  anything recorded in between), and `incidents` stays readable until then.
  The carer's file and evidence pack read concerns.
- **Safeguarding, accidents, reminders** (29 Oct 2026, migration
  20261029213200) — safeguarding's own six stages (`sg_*` kinds; the
  complaint-only stages no longer apply to it). "What the law asks of you" at
  the top of a safeguarding concern (council, CQC, police, and DBS once
  someone is removed) and an accident (RIDDOR, firmer when the answers say it
  looks reportable). A reminder is ticked by its stage's answers or by a
  manager's confirmation, kept in `complaints.reminders`; nothing is filed.
  The client's council is filled in on the referral.
- **Clients, compliments, the public link** (29 Oct 2026, migration
  20261029213300) — a concern shows "N concerns about this client this year"
  and the client's funder; the client's page lists its concerns and
  compliments. Compliments (`compliments`, `compliment_people`) are logged at
  `/org/complaints/compliments` and show on the carer's file; Staff Audits can
  read them into an appraisal. The raise-a-concern link
  (`/org/settings/complaints/link`, managers only; one per company, `concern_links`) opens
  `/concern/<token>`: no account, five an hour from one address, a honeypot,
  and it lands as a concern waiting for triage with the person's contact
  details and a reference they are shown.
- **Trends and MyRoster's newer parts** (29 Oct 2026, migration
  20261029213400) — `/org/complaints/trends` counts concerns by type,
  category, staff, client and month (12 or 24 months). From MyRoster, ported
  to this site's server-side PDFs: the **readiness check** on the Outcome
  Letter (warns, never blocks; also flags what changed since the letter was
  saved), the **interim update** PDF (done and still-to-come worked out from
  the record, "found so far" in the manager's words, kept in
  `complaints.interim_findings`), the **evidence bundle** ZIP (lead document,
  each finished stage, files numbered as the response lists them, a
  Contents.txt naming anything missing), and the **guidance** PDF in the
  company's name with its clients' councils. AI drafting, precedent and
  council tracking from MyRoster are not built: AI arrives with recruitment's
  AI release and slots into the letter panel (comment in `stage-panel.tsx`).

## Before the front door

- **Complaints** (`/org/complaints`, migration 20261024100000) — a seven-step
  process (concern raised, triage, acknowledge, investigate, findings,
  outcome, follow-up and close) with stages each company configures, stage
  forms (acknowledgement, meeting minutes, action plan, outcome letter, duty
  of candour, monitoring review), the clock (acknowledge in 3 working days,
  respond in 28), named staff, uploads, a PDF of the record, and actions on
  the task list. A record is a complaint, a safeguarding concern or an issue.
- **Incidents & accidents** (`/org/incidents`) — a separate register of
  complaints, accidents, near misses and safeguarding concerns, with the staff
  named and suggested training.

The problem: a complaint or a safeguarding concern can go in either place,
safeguarding has no process of its own, and accidents have no RIDDOR prompt.
On 29 Oct 2026 there are 2 test complaints and nothing in the register.

## One front door

Everything is raised in one place as a **concern**, then triaged into one of
five types, each with its own process:

| Type | Process |
|---|---|
| **Complaint** | Today's seven steps, with MyRoster's newer parts (below) |
| **Safeguarding** | Its own process (below) |
| **Issue** | Today's issue route: action plan and monitoring review |
| **Accident** | What happened, injuries, RIDDOR check, actions, suggested training |
| **Near miss** | What happened, what would have happened, actions |

The incidents register is merged into this; its rows (none today) would move.

**Triage checks.** As in MyRoster, triage sets the checks the concern needs,
and each can be linked from the concern: a **carer spot check** (Staff
Audits) and a **client QA** (Service audits), alongside carer statements and
uploaded evidence. Doing the check ticks it off on the concern.

**Raised by anyone in the office**, or by a family or client through a public
"raise a concern" link (like the feedback survey links), which arrives
waiting for triage.

## Safeguarding

1. Immediate actions to keep the person safe.
2. Referral to the council's safeguarding team — date and reference number.
3. CQC notification.
4. Police, if a crime may have happened.
5. The council's enquiry outcome (a Section 42 enquiry under the Care Act).
6. Lessons learned, and actions.

The legal reminders (council, CQC, and later a DBS barring referral if it
ends in a dismissal — HR-PACK.md) show the moment a concern is triaged as
safeguarding. The manager confirms each; the site never files anything.

## Accidents

What happened, who was hurt and how, first aid given, and a **RIDDOR
reminder** for injuries that must be reported to the HSE. Accidents and near
misses can lead to actions and suggested training.

## From MyRoster

Brought across (MyRoster `src/lib/complaint*.ts`, `concern*.ts`):

- **Interim letter** — for when the council chases part-way through: what's
  done, what's still to come and when, worked out from the file.
- **Readiness check** — what's still missing before the response goes out.
  Warns, never blocks.
- **Evidence bundle** — one ZIP, files numbered to match the appendices in
  the response; a missing file is listed as missing, not dropped.
- **Guidance** — the "what to do" procedure (Regulation 16, Regulation 20
  duty of candour), as a PDF to hand to a client, council or CQC.
- **AI drafting** — acknowledgement, interim and response letters, from what's
  on file only. 1.5 times cost; a person always checks and sends.
- **Precedent** — how similar closed complaints were handled shapes a draft's
  approach, never its facts.
- **Council tracking** — which council the concern is with, taken from the
  client's funder (see the client list in PACKAGES.md).

Waiting for the MyRoster review: anything that reads the rota — visit
records, QA visits from the rota, patterns spotted across visits.

## Also

- **Clients.** A concern links to a client from the client list (PACKAGES.md):
  "3 concerns about this client this year", and the council filled in.
- **Performance plans** can be raised from a concern and link back to it
  (STAFF-AUDITS.md).
- **Compliments** are logged too, linked to the carer they're about, and show
  on the carer's file and in their appraisal.
- **Who sees it.** Managers and office. A carer named in a concern never sees
  it.
- **Trends page.** Concerns by type, category, carer, client and month — for
  CQC's well-led questions.

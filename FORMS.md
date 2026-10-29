# Forms — agreed plan (29 Oct 2026)

Agreed with Saj on 29 Oct 2026. Nothing below is built yet beyond what's
marked as today's. Forms, with feedback surveys, are in Pro and up (see
PACKAGES.md).

## Today

- **The forms library** (ROADMAP §1b, `lib/form-library.ts`). We write forms
  at `/platform/forms`; a company asks someone to complete one; the carer
  fills it in on their own login at `/learn/forms`. File uploads, a typed-name
  signature, and responses on the carer's file and in the evidence pack. 3
  forms published (care assessment, client QA, job application) and 55 drafts
  converted from Saj's Word forms, not yet read through. The old builder is
  still at `/org/forms/own`.
- **Feedback surveys** (`lib/feedback.ts`, `/org/feedback`, public
  `/survey/<token>`). Two fixed surveys — client and family, and staff — sent
  by link, 1–5 ratings and two open questions, anonymous, averages shown.

## Forms that move to other add-ons

These drafts are now proper features elsewhere. They come out of the Forms
library, so there's one way to do each thing:

| Draft forms | Now part of |
|---|---|
| Job application (×2), structured interview record, reference request, conditional offer letter, DBS consent, identity and right to work, health declaration, criminal conviction risk assessment (×3, one in care), employment history and gaps, equal opportunities, driving licence and insurance, lone working suitability, qualification verification, agency and bank worker vetting, induction and shadowing sign-off, new starter compliance checklist | HR pack (RECRUITMENT.md, HR-PACK.md) |
| Annual supervision and appraisal, monthly staff 1-1, probationary period supervision, spot check (×2), medication competency observation | Staff Audits (STAFF-AUDITS.md) |
| Client quality assurance (×2), medication audit | Service audits (SERVICE-AUDITS.md) |
| Missed or late visit investigation | Concerns (COMPLAINTS-SAFEGUARDING.md) |

Their questions are reused there, not thrown away.

## What stays in Forms

- **Client care documents** — care assessment, initial assessment and
  admission, care and support plan (×3), sample care plan, goals and outcomes
  plan, risk assessments (×3), environment risk assessment, consent (×2),
  hospital passport, medical profile sheet, PEEP, oral care plan, pressure
  ulcer plan, MAR chart (×2), overstocked medication and returns, new client
  welcome call.
- **Company documents** — business continuity plan, fire, legionella and COSHH
  risk assessments, statement of purpose, service user guide, staffing
  structure, council visit readiness checklist, monthly management meeting.
- **Logs** — the 23 spreadsheet logs, and the tumble dryer filter check log.
- **Feedback surveys.**
- **Each company's own forms.**

Duplicates (the ×2 and ×3 above) are merged when the drafts are read through.

## Three kinds of form

- **Carer forms** — a carer fills them in on their own login, as today.
- **Client forms** — the office fills them in about a client picked from the
  client list (PACKAGES.md). The client or family can sign on the device.
  They show on the client page.
- **Company forms** — about the business, not a person.

**Care plans are forms**: a completed, signed document with a review date —
not a live care plan carers work from. A company using MyRoster keeps its
live care plans there.

## How they work

- **Review dates.** Forms that need reviewing (risk assessments, care plans,
  the business continuity plan) carry a review date and show in Who's due
  when it comes round.
- **Logs.** A log is a form you add a line to each time: the date, who did it,
  the result. The whole log reads as one table.
- **PDFs.** Every completed form becomes a PDF on the client page, the carer's
  file or the evidence pack.
- **Editable.** Our library is the starting point. A company can edit its own
  copy of a library form and build its own forms — replacing the 24 Oct 2026
  rule that only we write forms. A company can still ask us to build one.

## Feedback surveys

- **Editable questions**, starting from today's two surveys.
- **Sent** by email to families from the client list, or by a printed QR code.
- **Anonymous or named.** Staff surveys are always anonymous. A client survey
  can be either: a named one links to the client, so a low score can be raised
  as a concern and praise logged as a compliment, in one click.
- **Rounds** — a survey runs as a round (the annual survey, say) with its
  response rate.
- **"You said, we did"** — a one-page report of what people said and what was
  done about it.

## Reading the drafts

As part of the build, Claude reads through and publishes the ~25 drafts that
stay, each checked against Saj's original Word form, merging duplicates.

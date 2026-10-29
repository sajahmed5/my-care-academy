# Packages — agreed plan (29 Oct 2026)

Agreed with Saj on 29 Oct 2026. Nothing below is built yet: the next step is
mock-ups of the new and changed screens, then the build once they're approved.

Each package includes everything in the one below. A customer buys a whole
package; there are no single add-ons for now. Prices stay as the public site
has them (`lib/pricing.ts`) until Saj reviews them after the build.

| | Starter £49 | Growth £99 | Pro £149 | Enterprise £249 |
|---|:-:|:-:|:-:|:-:|
| Online training | ✓ | ✓ | ✓ | ✓ |
| HR pack | | ✓ | ✓ | ✓ |
| Staff Audits | | ✓ | ✓ | ✓ |
| Complaints & safeguarding | | | ✓ | ✓ |
| Service audits | | | ✓ | ✓ |
| Forms | | | ✓ | ✓ |
| Policies & procedures | | | ✓ | ✓ |
| Rostering integration + white label | | | | ✓ |
| Face-to-face training (Manchester only) | | | | ✓ |
| Bespoke reports | | | | ✓ |
| Priority support | | | | ✓ |

## What each line means on the site

- **Online training** — the course library, training matrix and exports,
  induction programmes, certificates, reminders. Every package. For everyone
  in the company, office staff and managers included (see Staff logins
  below), with new office and admin courses to write.
- **HR pack** (called Recruitment until 29 Oct 2026) — employing someone:
  recruitment from application to hire (RECRUITMENT.md), the carer's
  documents page with its Recruitment sub-page, probation reviews, sickness
  absence and return to work, disciplinary, grievance, and leavers. Planned
  in HR-PACK.md.
- **Staff Audits** — supervisions, appraisals, spot checks, competency
  assessments and performance plans, as real forms. Planned in
  STAFF-AUDITS.md.
- **Complaints & safeguarding** — one front door for complaints,
  safeguarding, issues, accidents and near misses, each with its own process.
  Planned in COMPLAINTS-SAFEGUARDING.md.
- **Service audits** — client QAs, medication and care plan audits per
  client, infection control, staff file and training audits, and a monthly
  governance report. Not on the sheet; placed in Pro, beside complaints and
  safeguarding. Planned in SERVICE-AUDITS.md.
- **Forms** — client, carer and company forms and logs, with review dates,
  and client and staff feedback surveys. Planned in FORMS.md.
- **Policies & procedures** — one combined pack, completed to a full CQC
  set, with review dates, who-reads-what, and acceptance tracking. Planned in
  POLICIES.md.
- **Rostering integration + white label** — the MyRoster connection,
  connected by the company itself, with an API for other systems; and white
  label on the company's own web address, with its logo and colour
  everywhere. Planned in INTEGRATION-WHITE-LABEL.md.
- **Face-to-face training** — sessions at our Stockport training office,
  booked by the company and included in the price, plus its own classroom
  sessions and Care Certificate observations. Planned in FACE-TO-FACE.md.
- **Bespoke reports** — the company asks, we build it with our own report
  builder within 10 working days (unlimited requests), and only that company
  sees it, live or emailed on a schedule. Planned in BESPOKE-REPORTS.md.
- **Priority support** — kept on the Enterprise card.

## Companies on MyRoster

A company connected to MyRoster uses MyRoster for everything apart from
training; the matching pages here show MyRoster's records read-only, and the
work is done in MyRoster. See MYROSTER.md.

## Staff logins

Agreed 29 Oct 2026. Today a login is one thing: a carer (training) or console
access (manager or office). An office worker can't be given training, appear
on the matrix, get certificates or book a holiday.

The change, for every package: **everyone in the company is a member of
staff** — training, certificates, holidays (HR pack), their own file — and
**console access is added on top**: none for a carer, Office, or Manager.
Someone with both gets a switch in the menu between My training and the
console. Managers have training records too.

Office staff get supervisions and appraisals (Staff Audits); spot checks and
competency stay for carers, as they happen in clients' homes.

New courses: office and admin training, alongside the 59 care courses.

## Clients

Agreed 29 Oct 2026. A simple client list — not a care-planning system — so
spot checks, client QAs, service audits and concerns all link to the same
person. Name, date of birth, region, postcode, the council or funder
(self-funded and NHS continuing healthcare included), whether the company
helps with their medication, start date, and active or ended. Each client has
a page showing their QAs, audits, concerns and compliments. Regions are the company's own list.

A manager uploads it from a CSV (with a template to fill in, and a check for
duplicates that updates rather than repeats), or adds clients one by one.
Growth and up: it appears with the first feature that uses it (spot checks in
Staff Audits). For a company that also uses MyRoster, the list could come from
there instead — part of the MyRoster review.

## What moves, by feature key

Package keys stay as they are (`core`, `core_forms`, `core_recruitment`,
`full`); only the public names show. The keys' old meanings no longer match
(`core_forms` is now the HR pack and Staff Audits package), so a comment says so.

| Feature | Today | Agreed |
|---|---|---|
| `recruitment.tracker` | Pro | **Growth** (HR pack) |
| `people.supervisions`, `people.competency` | Pro | **Growth** (Staff Audits) |
| `forms.builder` | Growth | **Pro** |
| `documents.library` | Growth | **Pro**, merged with the pack |
| `quality.feedback` | Pro | Pro (part of Forms) |
| `quality.audits` | Pro | Pro |
| `complaints.register` | Pro | Pro |
| `training.observations` | Enterprise | Enterprise (part of face-to-face) |
| Classroom sessions | every package, ungated | **Enterprise**, new key |
| Face-to-face booking | — | **new**, Enterprise |
| Bespoke reports | — | **new**, Enterprise |
| AI | — | **new**, any package with a feature that uses it; off by default, billed at 1.5 times cost |

New keys for the new parts (HR pack beyond recruitment, the client list,
holidays) are settled when the build is planned.

Nobody loses anything: on 29 Oct 2026 two organisations are on Starter and
one on Enterprise, none on Growth or Pro, and the only classroom session ever
recorded belongs to the Enterprise one.

## What people see when their package doesn't include something

- **Managers** see the locked parts in the menu and on the pages, with what
  the feature does and "Upgrade to Pro" (or Growth / Enterprise — whichever
  package first includes it).
- **Office workers** see the same locked parts, but with "Ask your manager"
  instead of an upgrade button; they can't change the package.
- **Carers** never see upgrade prompts. What the package doesn't include is
  simply not there.
- **Upgrade** goes to the Account page: the packages side by side, theirs
  marked, and a button that sends us the request. Package changes stay with
  us, as the Account page has always said; there's no card checkout.

## Mock-ups

Approved by Saj on 29 Oct 2026: the pricing page, the locked view (manager
and office), the upgrade request, and recruitment (tracker, candidate page,
the candidate's phone page, literacy test, interview record, offer letter).
Saj asked for no further mock-ups — the rest is built straight from the plans.
Canvas: https://claude.ai/artifact/DetQtzqJfXSqFeG5FqBDTW

## Build order

One change per release commit, as always. Each phase is deployed and checked
live before the next starts. The order puts the shared foundations first,
because every add-on after them uses them.

1. **Packages** — features regrouped into the new packages, new feature keys,
   the pricing page with the comparison table, the locked view and the
   upgrade request.
2. **Foundations** — staff logins (everyone is staff, console access on top),
   the client list with CSV upload, and AI (switch, metering, monthly limit,
   the usage line on the bill).
3. **HR pack** — recruitment (from MyRoster), the documents page, probation,
   absence and return to work, holidays, disciplinary and grievance, leavers.
4. **Staff Audits** — supervision, appraisal, spot check and competency forms,
   performance plans.
5. **Complaints & safeguarding** — the one front door, safeguarding,
   accidents, MyRoster's newer parts, compliments, trends.
6. **Service audits** — client QAs, client audits, staff file and training
   audits, the client page, the governance report.
7. **Forms** — the three kinds of form, review dates, logs, surveys.
8. **Policies** — clean-up, then the full list of titles to Saj before
   any are written.
9. **Integration and white label** — self-serve MyRoster connection, the API
   documentation, the company's own web address, logo and colour everywhere.
10. **Face-to-face training** — sessions, closed days, booking, the register.
11. **Bespoke reports** — requests, the report builder, scheduled sending.
12. **MyRoster read-only pages** — once MyRoster has the API in MYROSTER.md.

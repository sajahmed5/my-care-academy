# Companies on MyRoster and My Care Academy — agreed (29 Oct 2026)

Agreed with Saj on 29 Oct 2026. Nothing below is built yet.

## The rule

**A company connected to MyRoster uses MyRoster for everything apart from
training.** My Care Academy does the training.

Both products can do QAs, spot checks, complaints and the rest, so a company
not on MyRoster uses ours (the add-on plans in PACKAGES.md). A company on
MyRoster does that work in MyRoster.

## What a connected company sees here

The matching pages here — recruitment, complaints, spot checks, QAs,
supervisions and the rest — **show MyRoster's records, read-only**. Nothing
is completed here: each record and each "add" button links to MyRoster, where
it's done. No second copy is kept; the pages read MyRoster over the
connection.

Training works as it does today: MyRoster sends its carers in, assigns
training and reads the records and certificates back.

## How it works

- **MyRoster needs a way for us to read its records** — recruitment,
  complaints, spot checks, QAs, supervisions, appraisals, holidays, clients.
  That's built in MyRoster, in its own chat — the note below.
- Shown here per carer (their file, evidence pack) and per company (Who's
  due, the governance report), so an inspector's pack from here is complete.

## Settled 29 Oct 2026

- **What MyRoster doesn't have** — policies and acceptances, disciplinary and
  grievance, probation reviews, competency assessments — is done here, in My
  Care Academy, for connected companies too.
- **The MyRoster connection stays Enterprise-only for now**, to be looked at
  again later.
- **MyRoster's records show here for every connected company**, whatever its
  package — the work is paid for in MyRoster.
- **Office staff** are sent across from MyRoster too, so they get training
  here (see Staff logins in PACKAGES.md).

## Note for MyRoster's chat

MyRoster's code is changed in its own chat. This is the note to paste there:

> **My Care Academy needs to read MyRoster's records (decided 29 Oct 2026).**
>
> A company connected to both uses MyRoster for everything apart from
> training. My Care Academy's matching pages will show MyRoster's records
> read-only, with a link back to MyRoster to open or add each one. MCA never
> writes to MyRoster.
>
> Needed in MyRoster:
>
> 1. **A read-only API for MCA**, scoped to one company by a key, returning
>    each of these with a link to open the record in MyRoster:
>    - candidates and their recruitment stage and step statuses
>    - complaints and investigations: type, status, key dates, carers named,
>      client
>    - client QAs, carer spot checks, supervisions and appraisals: date,
>      who it's about, outcome or score, next due
>    - performance plans
>    - holidays and absences: carer, dates, type, status
>    - clients: name, date of birth, area, council or funder, active or ended
>    - feedback and satisfaction survey results
> 2. **Send office staff as well as carers** through the existing push of
>    learners to MCA (`/api/portal/sync-learners`), so office staff get
>    training there.
> 3. Optional, later: show MCA's policy acceptances and competency results on
>    the MyRoster carer profile, as training is shown today — MCA would add
>    them to `/api/portal/records`.

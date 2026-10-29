# Recruitment — agreed plan (29 Oct 2026)

Agreed with Saj on 29 Oct 2026. Nothing below is built yet. Recruitment is in
Growth and up (see PACKAGES.md).

## The aim

Today's tracker is a spreadsheet of uploads: a column per document, proving
the office has it. The new one does the work on the site — the candidate
applies, sits the literacy test, uploads their documents and signs online; the
interview is recorded here; referees answer by link; letters are written and
emailed from here. Paper still works: the office can upload a scan for any step.

## Where it comes from

MyRoster (github.com/sajahmed5/myroster, `src/lib/recruitment/`,
`src/app/recruit/`, `src/app/api/recruit*/`) already has this, built and field
tested with HG Care on the same stack (Next.js 16, Supabase). We bring it
across and adapt it, rather than building from nothing. Two things change on
the way:

- **Neutral defaults.** MyRoster's questions, test and letters were written
  for HG Care. Here they're defaults for every company, with no HG Care terms
  in them (MyRoster's signing documents already do this with [blanks]).
- **Each company edits its own.** Application questions, interview questions,
  the reference form, the literacy test, the DBS risk assessment, the letters
  and the signing documents all start from our default and can be changed by
  the company. MyRoster mostly fixes these in code.

## The four stages

| Stage | Steps | Done by |
|---|---|---|
| **1. Application** | Application form · literacy test | Candidate |
| **2. Interview** | Interview record and overall score · then a conditional offer letter, or a rejection letter | Office |
| **3. Checks** | Health, equality & DBS form · proof of ID · proof of address ×2 · proof of NI · right to work share code (only without a UK/Irish passport) · references · DBS · DBS risk assessment (only if the DBS shows a conviction) · training organised | Candidate, referees, office |
| **4. Sign-up** | Role acceptance · contract · refund of training agreement · shadowing · then Hired, and the welcome pack | Candidate, mentor, office |

Rejection can happen at any stage.

The conditional offer comes at the end of stage 2 for a legal reason: the
Equality Act 2010 s.60 bars health questions before a job offer, so the health
form can only come after it (MyRoster's starterForm.ts).

**Stage order.** A company setting: when on, each stage is locked until the
one before it is complete — for the candidate and the office alike. When off,
steps can be done in any order. (MyRoster only locks stage 1 before the rest.)

**Steps a company can switch off.** The health & equality form, refund of
training agreement, shadowing and welcome pack are on by default and can be
turned off. A company can also add its own steps (a driving licence, car
insurance), each shown as its own column on the tracker.

## Each step

- **Application form** — MyRoster's form: ten years of employment and address
  history with gaps explained, availability grid, convictions (worded for DBS
  filtering), whether they've been employed before. No health or equality
  questions (those come after the offer). Plus the role they're applying for
  and where they heard about the job. A company can add its own questions.
- **Literacy test** — 20 minutes, 20 marks, 80% to pass, marked automatically.
  The office unlocks it either in the office (a QR code the candidate scans,
  valid 15 minutes) or at home (a link by email). Leaving the page is noted;
  the office can allow a retake. Same test for everyone by default; a company
  can edit the questions (the same tap-to-answer types, so marking stays
  automatic), the time limit and the pass mark.
- **Interview** — the office types the answers in as the interview runs, then
  gives **one overall score** and an outcome (successful, unsuccessful, on
  hold). The candidate never sees it. Values-based questions that ask for real
  examples, as MyRoster's.
- **References** — two by default (one from the most recent employer); three
  if never employed. A company can make a third reference standard, and it
  shows as its own column. The referee gets a link with the candidate's name
  and date of birth already filled in, an employer or a character form, and an
  automatic reminder if they don't reply.
- **Documents** — ID, address, NI, share code, DBS: uploaded by the candidate
  from their phone (photo or PDF, up to 10MB) or by the office. An upload by
  the candidate shows as Submitted; the office confirms it or sends it back
  with a note.
- **DBS** — by default the candidate isn't hired until the DBS is back; a
  company can choose to allow a start before it. A tick box says whether the
  DBS shows a conviction; if it does, the DBS risk assessment is filled in
  here.
- **Signing** — role acceptance, contract and refund of training agreement,
  signed online by the candidate and then by the company. The contract is our
  template with the company's own pay, hours and address filled in (it can't
  be sent while a blank remains), or the company's own contract, which we set
  up for them. Each save of the wording is a new version, and a signed copy
  keeps the exact wording that was signed.
- **Shadowing** — the mentor's feedback form. (MyRoster also ties shadowing to
  rostered visits; there are no visits here, so it's the form only.)
- **Hired** — the candidate's login becomes their carer login, their checked
  documents (right to work, DBS, references) move onto their staff file with
  expiry dates so reminders carry on, their induction starts, and the welcome
  pack is emailed.

## The candidate's side

The candidate gets an email invite and sets a password. Their candidate page
lists their steps, stage by stage: what's done, what's waiting for the office,
what's been sent back, and what's theirs to do. The same login becomes their
carer login when they're hired — one account from applicant to carer.

Each company gets an apply link to put in its job adverts.

## Letters

Conditional offer and rejection letters are emailed to the candidate. They
carry the company's name only, with My Care Academy in the footer.

- **Offer** — the company's position, hours and pay wording, signed by its
  named signatory. A "why we chose you" section can be drafted by AI from the
  interview notes and the application.
- **Rejection** — the office ticks reasons, each carrying a kind, plain
  sentence, plus an optional line of its own and whether they may apply again.
  Never a reason about health, age, family, religion, nationality or any
  other personal characteristic, nor what a DBS or referee said.
- A person always reads, edits and sends a letter. AI never sends anything.

## AI

- Each company chooses whether to switch AI on (off by default).
- Every Claude request is recorded against the company with its cost, as
  MyRoster's aiGovernance.ts does.
- The company is charged **1.5 times** what the AI costs us, added to its
  monthly bill as an "AI usage" line, and it can set a monthly spending limit.
- The company's Account page shows its AI use this month.

## The office's side

- The tracker: one row per candidate, a column per step, grouped by stage,
  each cell showing its state. The role and where they heard about the job
  are on each row.
- The candidate's page: every step, with its record, upload or form.
- Settings (managers): stage order on or off, which optional steps are on,
  references required, DBS before start or not, the offer wording and
  signatory, and editors for each form, the test, the letters and the
  signing documents.
- Rejected candidates' documents are deleted automatically after 6 months,
  with a warning to the manager first.
- A summary at the top: applicants this month, how many at each stage,
  average days to hire, and which source brings the most hires.

## Today's data

Two candidates, both test data in the Enterprise organisation. Nothing real
needs moving to the new model.

## Companies on MyRoster

Settled 29 Oct 2026 (MYROSTER.md): a company connected to MyRoster recruits
in MyRoster. The recruitment page here shows MyRoster's candidates, read-only,
with links to MyRoster to do the work.

## Build order (29 Oct 2026)

Recruitment ships in releases, each usable on its own. Until a step's online
form exists, it works the paper way: the office uploads it and confirms it.

1. **Stages and steps** — the four stages and every step, each step's state
   (not started, waiting on us, sent back, confirmed, not needed), the office
   uploading, confirming, sending back and marking not needed, the tracker
   and candidate page as mocked, role and source, the company's recruitment
   settings (stage order, steps switched off, a third reference, DBS before
   start), and hiring. Step states live on candidate_documents, which already
   holds each step's file.
2. **The candidate's side** — the apply link, the online application form,
   the candidate's login and page, and uploads from their phone.
3. **Literacy test** — QR code in the office or a link by email.
4. **Interview and references** — the interview record, references by link
   with reminders.
5. **Offer, letters and AI** — offer and rejection letters, the AI switch and
   usage billing, the health and equality form.
6. **Sign-up and hire** — signing online, shadowing, the welcome pack, and
   hire moving documents onto the staff file.
7. **Editing** — each company's own questions, test, letters and documents.

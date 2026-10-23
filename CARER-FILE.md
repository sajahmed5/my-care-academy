# Carer file — spec (CARER-FILE.md)

> Agreed with Saj, 23 Oct 2026. **Nothing here is built yet.** This is the plan for turning
> `/org/staff/[userId]` from a training record into the whole file on a person, and for the
> export that hands that file to an inspector. Read `SPEC.md` first for the product and the
> roles; this spec assumes them.

---

## 1. What it is, and why

Today the staff page answers one question: *what training has this person done?* The file
answers the question a manager is actually asked: **show me everything about this person.**

Training, certificates, Care Certificate progress, right-to-work documents, supervisions, spot
checks, competency assessments, forms they completed, complaints or incidents they were part
of, and the actions outstanding against them — one page, one person.

That matters because of the moment it is built for. An inspector asks for a staff member's
file, and the provider currently assembles it from a folder, an inbox and three systems. We
hand them a dated PDF. Nothing else we sell is as easy to demonstrate in ten seconds, and it is
the reason a provider pays £149 rather than £15 a head for courses elsewhere.

It is also the spine the rest of the roadmap hangs from: every new compliance area (supervisions,
audits, incidents) becomes **one more section on this page** rather than one more tab in the nav.

---

## 2. The page

Route stays `/org/staff/[userId]`. The header stays as it is — name, email, role pill, progress
ring, Remind, the stat tiles. What changes is everything below it: today's course list becomes
one section among several.

### Sections

| Section | Feature key | Source | Status |
|---|---|---|---|
| Training | — (core) | `enrolments`, `lib/org-learner` | **built** — today's page |
| Certificates | — (core) | `certificates`, existing ZIP pack | **built** |
| Care Certificate | `training.observations` | `observations` | **built** (own area) |
| Forms completed | `forms.builder` | `form_submissions` | **built** (own area) |
| Recruitment & right to work | `recruitment.tracker` | `candidates` | **partial** — candidates only, not current staff |
| Supervisions & appraisals | `people.supervisions` | `supervisions` | **built** — 23 Oct 2026 |
| Spot checks & competency | `people.competency` | `competency_checks` | **built** — 23 Oct 2026 |
| Complaints & incidents | `complaints.register` | `incidents` (+ people, training) | **built** — 23 Oct 2026 |
| Actions & tasks | — (core) | derived + `record_actions` | **built** — 23 Oct 2026 |

The policies library is still tickable on the Packages screen with nothing behind it. It gets
built or it comes off the matrix; a tick that grants nothing is worse than an absent feature.
(`complaints.register` was the other one. It is built, as of 23 Oct 2026.)

### Behaviour

- **Tabs, deep-linkable** (`?section=supervisions`), defaulting to Training. The export and any
  "3 actions outstanding" link elsewhere in the app must be able to land on a section.
- **Each section loads its own data.** Not one page-level query fetching nine areas — a file on
  a carer with four years of history is the page most likely to hit the 1,000-row cap, and most
  of it is never looked at. Section queries use `fetchAll` where a count can run away.
- **Counts in the tab label** only for sections the organisation is entitled to. See §3.
- **Mobile**: sections stack as an accordion, Training open. A manager does this on a phone in
  a car between visits.

---

## 3. Locked sections

If the organisation does not have the feature, the section still appears, locked.

Showing it teaches the customer the product exists; hiding it means they never learn. The nav
already works this way (`components/sidebar-nav.tsx` carries a `feature` on each item), so this
is the same idea one level down.

**Entitlement comes from `lib/entitlements.ts`** — `enabledMap()` once per render, not a call
per section. That function resolves the organisation's exception over the package tick through
the same `has_feature()` the RLS policies use, so the page and the row gate can never disagree.
It fails closed.

**Lock at the query, not in CSS.** A locked section runs no query and renders no data: no
counts, no names, no dates, no "3 supervisions recorded". This is not a cosmetic state — an
organisation that downgrades still has rows in the table, and a greyed-out panel that leaks them
is a way to read data they stopped paying for.

**What it says.** The section title, one line naming the plan, and a link to the Account page:

> **Supervisions & appraisals** — part of Pro. See what each plan includes →

Not "feature not selected". The customer does not know what a feature is; they know what a plan
is.

**Who sees it:**

| Role | Entitled section | Unentitled section |
|---|---|---|
| org_admin | full | locked, with the upsell line |
| learner (own file) | full, minus manager-only sections (§6) | nothing — no section, no upsell |
| platform_admin | full | full — they always pass `hasFeature()`, by design |

---

## 4. Evidence pack export

One button on the file: **Download evidence pack**.

- **Per person, per period.** Default "everything", with a date range — an inspector asks for
  "since her last supervision" far more often than for four years of history.
- **One PDF**, ordered by section, with a cover sheet: the person, the organisation, the date
  range, when it was generated and by whom, and — explicitly — which sections are *not*
  included because the organisation does not have them. A pack that silently omits supervisions
  looks like a provider with no supervisions.
- **Plus the source files**, where they exist, as a ZIP alongside: certificate PDFs (the
  certificates pack already does this — reuse it), uploaded right-to-work documents, signed
  forms.
- **Only entitled sections.** Same `enabledMap()` as the page, resolved once at the start of the
  job. A pack must never contain a section the page would have locked.

**Generation.** Build it the way the certificates pack is built: if it is small, return it
inline; if it is not, write it to storage and hand back a link. Supabase functions stop at 60
seconds and a four-year file with attachments will not make it. A route handler that runs as the
service role must use `hasFeatureForOrg()` — `has_feature()` reads the signed-in user's
organisation and there isn't one.

**Audit it.** Who exported whose file, when, and for what range. A carer file is an HR record
about a named person; "we don't know who downloaded it" is not an answer anyone wants to give.
Row per export, visible to the org admin.

---

## 5. Data model

**Per-type tables, not one polymorphic `person_records`.** A supervision has a supervisor, a
date, agreed actions and two signatures; a competency check has an assessor, a standard and a
pass/fail; a complaint has a complainant and an outcome. Forced into one table they become a
JSON blob that cannot be queried, reported on, or given its own RLS. They share a *shape* on the
page, not a schema.

What they do share is **actions**. One `record_actions` table — owner, due date, source record,
done-at — is what makes "tasks per person" one list rather than five.

**The task list is a union, not a copy.** Training due dates, certificate expiries and DBS
expiries are already derived from their own rows; do not write them into a tasks table as well,
or the two will disagree within a week. The list is derived rows plus `record_actions`, resolved
at read time — `lib/person-tasks.ts`, built 23 Oct 2026.

**The list itself is not gated**, though the spec first assumed a `people.tasks` key. It is
mostly a view over training, which every package includes, and gating it would hide a carer's
own overdue course behind an upsell. What is paid for is what feeds it: supervision actions
exist only for organisations that have supervisions.

**Every new table** (`AGENTS.md`): its own grants — `select, insert, update, delete` to
`service_role`, the narrowest set the UI needs to `authenticated`, nothing to `anon` — RLS
policies, a feature row in the migration *and* in `lib/features.ts`, and the parity test will
hold the two together.

---

## 6. Permissions

- **org_admin** — the whole file for their organisation.
- **learner, own file** — training, certificates, Care Certificate, their own forms, their own
  tasks. **Not** supervision notes, complaints they are named in, or competency assessor
  comments until that is deliberately designed; a carer opening the app and reading a manager's
  unfinished note about them is a serious problem, not a small one.
- **platform_admin** — read-only, as everywhere else.

RLS does the scoping. No section may rely on the page having filtered by organisation.

---

## 7. Data protection

The file is an HR record on a named person, and assembling scattered records into one place
raises the stakes of every existing rule rather than creating new ones.

- **Retention** — needs a stated period per record type. Not answered yet (§9).
- **Erasure** — `tests/user-erasure.test.ts` exists and must grow to cover every new table.
  A carer who leaves and asks to be erased cannot have supervisions left behind.
- **Subject access** — the evidence pack is, conveniently, most of a subject access response.
  Worth saying so in the sales copy.

---

## 8. Build order

1. **Sections scaffold** — tabs on the existing page, today's training moved into one, every
   future section present and locked. No new tables. This is a day's work and it sells the
   roadmap on its own.
2. **Actions & tasks** — `record_actions` plus the derived union. The keystone: it makes the
   existing features feel like one product. **Built 23 Oct 2026** (v2.12.5): training still to
   do, certificates at or near expiry, and written-down actions a manager can add and tick off.
   Only the written-down ones can be ticked — a derived task is completed by doing the work.
3. **Supervisions & appraisals** — the most-asked-for evidence, and the template for every
   record type after it. **Built 23 Oct 2026** (v2.12.6): a dated record with who held it, what
   was discussed and when the next one is due, and a "what was agreed" box whose lines become
   actions in the carer's task list. Gated on `people.supervisions`, which is in no package yet
   — that tick is a commercial decision for the Packages screen.
4. **Spot checks & competency** — same engine, aimed at existing staff rather than new ones.
   **Built 23 Oct 2026** (v2.12.7): an area, an outcome, what was seen, when the next one is
   due, and follow-up actions into the task list. A carer has several areas running at once, so
   "next due" is the soonest across them and anything short of competent is surfaced at the
   top. The half it shares with supervisions moved to `lib/records.ts` rather than being
   copied — two definitions of "overdue" in one product is how this goes wrong.
5. **Complaints & incidents** — finishes a feature already on the matrix, and brings the
   suggested-training link (below). **Built 23 Oct 2026** (v2.12.8): complaints, accidents,
   near misses and safeguarding concerns, with a register at `/org/incidents` and the people
   named in each one tagged from their own file. Closing one asks what came of it. The
   suggestion panel sits under each record in the carer's file; `incident_training` records
   which course a manager assigned, when, and why.
6. **Evidence pack** — last, because it is only as good as what it has to assemble.

**Suggested training, not automatic.** When a complaint or a failed spot check is linked to a
person, the file suggests courses — medication error → Medication Administration, a dignity
complaint → Privacy & Dignity — and a manager accepts with one click and a reason. Never
auto-assigned: a complaint that turns out to be unfounded would already have produced a training
record, and "assigned automatically on receipt of complaint" reads badly in front of a tribunal.
"Manager reviewed and assigned on 3 November" reads correctly. Expiry and induction stay
automatic; those are not judgements about a person.

---

## 9. Open questions

- **Which plan owns which section.** §2 names feature keys; the Packages screen decides what is
  in Growth, Pro and Enterprise. Not set.
- **Retention periods** per record type.
- **Does a learner see their own supervision?** Signed and agreed, arguably yes; in draft,
  clearly not. Needs a decision before supervisions are built.
- **Agency and bank staff** — people who are not employees but whose file an inspector will
  still ask for.
- **Multi-site** — a carer who works across two of an organisation's services.

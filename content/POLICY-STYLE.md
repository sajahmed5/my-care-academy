# How we write policies

The house style for the policies in `content/policies/` (POLICIES.md,
"Completing the library"). Each file is one policy version, loaded as a draft
by `scripts/seed-policy-drafts.mjs`; Saj reads every one before it is
published.

## What a policy is for

A small homecare or care home company adopts the policy, checks it, and
publishes it to staff, who read and accept it on their phones. So:

- **Finished, not a skeleton.** Write the actual policy. A company should be
  able to publish it after reading it and filling in a handful of genuinely
  local facts. The older imported templates are mostly "[Describe how…]"
  guidance; ours are not.
- **Fill-ins only for what we cannot know.** Use the company's details as
  tokens (below). Use a `[bracketed fill-in]` inside a sentence, or a `> `
  guidance block, only for something that is truly theirs — the local
  authority's safeguarding number, the name of their payroll provider, their
  on-call arrangements. Two or three per policy at most; many have none.
  Every fill-in blocks publishing until it is written over, so each one must
  be worth the company's time.
- **Readable by a carer.** Plain English, short sentences, UK spelling. Say
  what to do, in the order you would do it. Explain a legal term the first
  time it appears. Aim for 900–1,600 words: thorough enough for an inspector,
  short enough to be read on a phone.
- **Accurate.** Name the law and guidance that actually applies in England,
  by its proper title, and do not invent numbers, deadlines or thresholds. Where
  a figure changes from year to year (pay rates, Statutory Sick Pay, holiday
  carry-over limits that depend on contracts), say where it comes from rather
  than stating it. CQC's framework is the Single Assessment Framework with its
  quality statements under the five key questions (safe, effective, caring,
  responsive, well-led); the regulations are the Health and Social Care Act
  2008 (Regulated Activities) Regulations 2014 — cite the regulation number
  (e.g. Regulation 13: Safeguarding service users from abuse and improper
  treatment).

## Voice and words

- The company is `{{organisation}}` on first mention in the opening section,
  then "we". Staff are "you" in procedures written for them, or "staff" /
  "care workers" (domiciliary) / "care staff" (residential).
- **Domiciliary** versions say "client", "visit", "the client's home",
  "the office", "on-call". **Residential** versions say "resident", "the
  home", "the shift leader", "the nurse in charge" only if nursing applies
  (assume a care home without nursing). A policy for **all** services says
  "the people we support" and "where they live", and covers both settings
  where they differ, in a sentence each.
- Not "service user". Not "SU". Not "staff member must ensure that" — say
  who does what: "The care worker…", "The registered manager…".
- No marketing tone, no exclamation marks, no emojis.

## Tokens (merged from Settings → Policies when a company adopts it)

`{{organisation}}` `{{registered_manager}}` `{{nominated_individual}}`
`{{office_address}}` `{{office_phone}}` `{{office_email}}` `{{service_area}}`
`{{cqc_provider_id}}` — no others. Use them where a reader needs the fact
("report it to {{registered_manager}} on {{office_phone}}"). A token the
company has not filled in becomes a fill-in, so don't scatter them.

## Shape

Front matter, then the sections below, numbered `## 1. Purpose` … Use only
what fits; keep the order.

```
---
code: MCA-ALL-SAFEGUARDING-CHILDREN     # MCA-ALL-… / MCA-DOM-… / MCA-RES-…
title: Safeguarding Children           # no "Policy" on the end
category: Safeguarding and concerns     # one of the seven below
service: all                            # all | homecare | care_home
sort: 15                                # order within the category
---
```

1. **Purpose** — why this policy exists, in two or three sentences.
2. **Scope** — who and what it covers.
3. **The law and guidance** — bullets: Act / regulation / guidance, each with
   a few words on what it requires of us.
4. **Our policy** — the commitments, as bullets or short paragraphs.
5. **What to do** (or **How we…**) — the procedure, in `###` subsections,
   step by step. This is the part a carer uses.
6. **Roles and responsibilities** — bullets, "**Registered manager** — …".
7. **Training** — what training, when, and refreshed how often.
8. **Records** — what is written down, where, and for how long.
9. **Related policies** — bullets naming our other policies by their titles.
10. **Review** — one sentence: reviewed every year, and sooner when the law,
    guidance or something that happens here shows it needs to change.

Categories: Care and support · Safeguarding and concerns · Medicines and
health · Health and safety · Staff and employment · Information and records ·
Governance and quality.

## Markdown the loader understands

`## ` heading · `### ` sub-heading · `- ` bullet (a block of bullet lines) ·
`> ` guidance (shown to the company as something to write) · anything else is
a paragraph. Separate blocks with a blank line. Bold, italics and links are
not rendered — write plain text.

## The site's own features

Where the product does part of the job, say so plainly — it is what the
company bought: acceptances are recorded on the site; supervisions,
appraisals, spot checks and competency are recorded on the person's file;
complaints, safeguarding concerns, accidents and incidents go through the
site's concerns process; training and certificates are on the training
matrix; the HR pack records absences, leave, disciplinary and grievance cases
with letters and deadlines. Never name another product. Do not describe
screens or buttons — the policy must still be true if the screen changes.

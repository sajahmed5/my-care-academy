# Brief for writing a batch of policies

You are writing policy templates for My Care Academy, a training and compliance
site for small UK home-care (domiciliary) companies and care homes in England.
Saj, the owner, has approved the list of titles and will read every policy
before it is published, so quality and legal accuracy matter more than speed.

Work in /Users/saj/Source Code/homecare-training-site/.claude/worktrees/policies-addon-bb2808

## Read first
1. content/POLICY-STYLE.md — the house style. Follow it exactly.
2. The eight finished examples in content/policies/ (all-mental-capacity.md,
   all-safeguarding-children.md, all-disciplinary.md, all-grievance.md,
   all-sickness-absence.md, all-annual-leave.md, dom-lone-working.md,
   all-data-protection.md). Match their structure, tone, length (900–1,600
   words) and the sparing use of fill-ins.

## Rules
- Write ONLY the files listed in your batch, into content/policies/, with the
  file name, code, title, category, service and sort given. Do not edit any
  other file. Do not run git.
- After writing them, run `node scripts/seed-policy-drafts.mjs --dry-run` and
  fix any parse error. NEVER run it without --dry-run — the session that
  started you loads them.
- Title in front matter exactly as given. No "Policy" on the end.
- Related policies: name only titles from the full library list below.
- A domiciliary and a residential version of the same title must genuinely
  differ where the settings differ (who is there, who you call, the building,
  night cover) — not the same text with words swapped.
- Accuracy: cite law and guidance that really applies in England, by its
  proper name. Do NOT invent figures, deadlines or thresholds; if unsure of a
  number, describe the rule without it ("within the time the regulations
  set"). Do not cite the Employment Rights Act 2025 or any law you are not
  sure is in force. The Liberty Protection Safeguards are NOT in force: DoLS
  applies in care homes and hospitals; a deprivation of liberty anywhere else
  (including a person's own home) needs Court of Protection authorisation,
  sought by the local authority or NHS body that funds or arranges the care.
  CQC notifications are under the Care Quality Commission (Registration)
  Regulations 2009 (Regulation 16 deaths, 18 other incidents including
  serious injuries, abuse or allegations, police involvement, DoLS outcomes
  for care homes; Regulation 14 a registered manager's absence of 28 days or
  more). Fit and proper persons: Regulation 5 (directors), 19 (persons
  employed), 7 (registered managers) of the 2014 Regulations. Regulation 9A
  (visiting and accompanying in care homes) has been in force since April 2024.
  Independent care providers are not named authorities under the Prevent duty
  (Counter-Terrorism and Security Act 2015, section 26) — say we follow it
  because commissioners expect it and it protects people. The Modern Slavery
  Act 2015 transparency statement applies only above a turnover threshold —
  don't claim it applies to every company. National Minimum Wage includes
  time travelling between visits.
- Use the site's own features where they do the job (see "The site's own
  features" in the style guide) without describing screens.
- Fill-ins: at most two or three per policy, only for genuinely local facts.

## The full library (titles you may name in Related policies)
Care and support: Assessment and Starting a Service; Person-Centred Care
Planning; Consent; Mental Capacity, Best Interests and Advocacy; Deprivation of
Liberty; Dignity, Privacy and Respect; Choice and Positive Risk-Taking;
Accessible Information and Communication; Positive Behaviour Support;
Restraint and Restrictive Practice; Personal Care, Continence and Oral Health;
Nutrition and Hydration; Pressure Ulcer Prevention and Skin Care; Falls
Prevention and Management; Moving and Handling; End of Life Care, Death and
Advance Decisions; Hospital Admissions and Discharges; Sexuality and
Relationships; Handling Clients' Money (domiciliary) / Residents' Money and
Property (residential); Gifts, Gratuities and Legacies; Ending a Service;
Missed and Late Visits; Key Holding and Key Safes; No Reply and Unable to Gain
Entry; Visiting; Activities and Social Inclusion; Missing Residents.
Safeguarding and concerns: Safeguarding; Safeguarding Children;
Whistleblowing; Complaints; Duty of Candour; Accidents, Incidents and Near
Misses; Reportable Incidents; Prevent; Modern Slavery.
Medicines and health: Medicines Management; Covert Medication; Delegated
Healthcare Tasks; Infection Prevention and Control; Outbreak Management; First
Aid, Medical Emergencies and Deterioration.
Health and safety: Health and Safety; Risk Management; Lone Working; Driving
at Work; Violence and Aggression Towards Staff; COSHH; Equipment and
Maintenance; Business Continuity and Emergency Planning; Fire Safety; Safety
and Security of Premises; Legionella and Water Safety.
Staff and employment: Recruitment; Right to Work and Sponsored Workers;
Induction, Probation and the Care Certificate; Training and Development;
Supervision and Appraisal; Code of Conduct, Professional Boundaries and Dress;
Equality, Diversity and Human Rights; Bullying and Harassment; Social Media,
Phones and Technology; Alcohol and Drugs; Disciplinary; Grievance; Sickness
Absence; Annual Leave; Family Leave; Flexible Working; Working Time and Rest
Breaks; Staff Wellbeing and Stress; Safe Staffing, Rotas and Agency Staff;
Employee Handbook.
Information and records: Data Protection and Access to Records;
Confidentiality; Record Keeping and Retention; Data Security and Breaches;
CCTV.
Governance and quality: Governance and Quality Assurance; Fit and Proper
Persons; Registered Manager Absence and Deputising; Policy Management and
Review.

## When done
Reply with: the files you wrote, the dry-run output line, and any point of
law or practice you were unsure of (so it can be checked) — nothing else.

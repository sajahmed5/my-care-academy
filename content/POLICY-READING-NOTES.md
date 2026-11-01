# Reading notes for the 80 new policies (31 Oct 2026)

> **Published 1 Nov 2026.** All 80 policies were reviewed in full against the
> law in force on 1 November 2026, corrected where needed, and published at
> Saj's request. None duplicated a published policy. Changes made then include:
> the 2026 Supreme Court judgment on deprivation of liberty (Cheshire West
> overruled); the Information Commission replacing the ICO; the "all reasonable
> steps" harassment duty from 30 October 2026; right to work checks covering
> workers and contractors from 1 October 2026; subject access and data
> protection complaints under the Data (Use and Access) Act 2025; and unfair
> dismissal after six months from 1 January 2027. The 90 old form and log
> documents were retired: the forms library replaced them.

All 80 are drafts in the library: Content → Policies, filter **Draft**
(`/platform/documents?status=draft`). Each opens as a company will see it,
with "Sample Care Services Ltd" and the company's details shown as fill-ins
such as [Registered manager]. Publish each one from its own page once you have
read it; nothing reaches a company until you do. To change the wording, edit
the file in `content/policies/` (or ask Claude) and re-run
`node scripts/seed-policy-drafts.mjs` — it only ever rewrites drafts.

## Where to look hardest

Points the writers were unsure of, or our own choices rather than law.

**Our own choices — kept as recommended practice (Saj, 1 Nov 2026)**
- Residents' Money and Property: weekly balance checks and a monthly manager audit.
- Nutrition: residents weighed and screened (MUST) at least monthly; homecare carers report "little or nothing eaten for two visits in a row"; reheat food only once.
- Covert Medication: plans reviewed at least every six months.
- Risk Management: business risk register reviewed at least every three months.
- Fire Safety: each member of staff in at least two drills a year.
- Deprivation of Liberty (residential): the senior in charge may grant an urgent authorisation when the registered manager cannot be reached.
- Outbreak Management and Visiting: every resident keeps at least one visitor during an outbreak — written as our commitment, not as the law.
- Moving and Handling (homecare): a hoist the client bought themselves is not used without a record of a thorough examination, which the registered manager arranges.
- Gifts: the value limit is left as a fill-in for each company.
- Supervision and Appraisal: the default periods from the Staff Audits plan (supervision every 3 months, appraisal yearly).

**Law and guidance — checked 1 Nov 2026**

Changed in the files and re-seeded:
- Falls (both): cites NICE NG249 (April 2025), which replaced CG161.
- Accessible Information Standard: cites DAPB1605, revised in 2025.
- Training, and Induction and Probation: the Oliver McGowan Code of Practice, in force since September 2025, which CQC uses when checking.
- Prevent: names the GOV.UK course, "Prevent duty training: referrals".
- Hospital Admissions and Discharges: the guidance's exact title, Hospital discharge and community support (DHSC, statutory, last updated January 2024).
- Family Leave: since 6 April 2026, paternity leave and unpaid parental leave are day-one rights, and bereaved partner's paternity leave (unpaid, up to 52 weeks) exists. All three are now in the policy.

Confirmed as written:
- Modern Slavery: the Modern Slavery & Exploitation Helpline, 08000 121 700.
- Health and Safety (homecare): gas emergency, 0800 111 999.
- Fit and Proper Persons: Regulations 5, 6, 7 and 19, and Schedules 3 and 4 Part 1, are cited correctly.
- Family Leave figures: maternity 52 weeks (2 compulsory), paternity 1 or 2 weeks, neonatal up to 12 weeks, parental bereavement 2 weeks, carer's leave notice twice the leave or 3 days.
- Sickness Absence: says "the rules in force", so it already covers Statutory Sick Pay being paid from day one since April 2026.
- Fire Safety: since October 2023 the Building Safety Act requires every fire risk assessment to be recorded in full.
- Legionella: 60°C stored, 50°C within a minute, cold below 20°C, 44°C at outlets used by vulnerable people, records kept 5 years.
- Data Security: breaches can go to the regulator through the DSPT. The ICO became the Information Commission on 30 September 2026; the policies now use that name.
- Working Time: Tyco still stands as assimilated case law.

Decided by Saj, 1 Nov 2026:
- Sexuality and Relationships: left as it is, with nothing on single-sex spaces.
- Pressure Ulcers: we advise notifying CQC of any category 3, 4 or unstageable pressure ulcer; the registered manager makes the final decision. The policy now says so.
- The "our own choices" above stay as written: recommended practice, which a company can change in its own copy.

**Fill-ins a company completes** — kept to local facts: local authority safeguarding and DoLS contacts, interpreting service, on-call and sickness reporting notice, leave year and bank holidays, sick pay, the "late visit" window, insurance cover, and a few similar.

# The 27 older policies, rewritten (1 Nov 2026)

The 27 policies published before the 80 were fill-in-the-blanks templates:
headings and "[Describe how…]" guidance. Each has been rewritten in full, in
the house style, under a new code.

> **Published 1 Nov 2026** at Saj's request: the 27 new ones published and the
> 27 old ones retired, each change audited (policy.status). Only Demo Care Ltd
> had adopted an old one, an unpublished draft of homecare Consent with no
> acceptances; it was deleted so the demo can adopt the new one.

| Old code | New code | File |
|---|---|---|
| MCA-RES-CONSENT-463B | MCA-RES-CONSENT | res-consent.md |
| MCA-DOM-CONSENT-POLICY-BB81 | MCA-DOM-CONSENT | dom-consent.md |
| MCA-RES-PERSON-CENTRED-CARE-PLANNING-E8FB | MCA-RES-PERSON-CENTRED-CARE-PLANNING | res-person-centred-care-planning.md |
| MCA-RES-POSITIVE-BEHAVIOUR-SUPPORT-1589 | MCA-RES-POSITIVE-BEHAVIOUR-SUPPORT | res-positive-behaviour-support.md |
| MCA-RES-RESTRAINT-B599 | MCA-RES-RESTRAINT | res-restraint.md |
| MCA-DOM-GOVERNANCE-AND-QUALITY-ASSURANCE-POLICY-988F | MCA-DOM-GOVERNANCE | dom-governance.md |
| MCA-RES-GOVERNANCE-AND-QUALITY-ASSURANCE-9FDE | MCA-RES-GOVERNANCE | res-governance.md |
| MCA-RES-RISK-MANAGEMENT-7A3D | MCA-RES-RISK-MANAGEMENT | res-risk-management.md |
| MCA-RES-SAFETY-AND-SECURITY-OF-PREMISES-F576 | MCA-RES-PREMISES-SECURITY | res-premises-security.md |
| MCA-RES-MEDICINES-MANAGEMENT-987E | MCA-RES-MEDICINES | res-medicines.md |
| MCA-DOM-MEDICINES-MANAGEMENT-POLICY-7196 | MCA-DOM-MEDICINES | dom-medicines.md |
| MCA-RES-INFECTION-PREVENTION-AND-CONTROL-239C | MCA-RES-INFECTION-CONTROL | res-infection-control.md |
| MCA-DOM-INFECTION-PREVENTION-AND-CONTROL-POLICY-622E | MCA-DOM-INFECTION-CONTROL | dom-infection-control.md |
| MCA-RES-SAFEGUARDING-E6D6 | MCA-RES-SAFEGUARDING | res-safeguarding.md |
| MCA-DOM-SAFEGUARDING-POLICY-0443 | MCA-DOM-SAFEGUARDING | dom-safeguarding.md |
| MCA-DOM-WHISTLEBLOWING-POLICY-4AE7 | MCA-DOM-WHISTLEBLOWING | dom-whistleblowing.md |
| MCA-RES-WHISTLEBLOWING-07AC | MCA-RES-WHISTLEBLOWING | res-whistleblowing.md |
| MCA-DOM-COMPLAINTS-POLICY-BBBA | MCA-DOM-COMPLAINTS | dom-complaints.md |
| MCA-RES-COMPLAINTS-A19E | MCA-RES-COMPLAINTS | res-complaints.md |
| MCA-ADD-DUTY-OF-CANDOUR-POLICY-DOMICILIARY-CARE-E129 | MCA-DOM-DUTY-OF-CANDOUR | dom-duty-of-candour.md |
| MCA-RES-DUTY-OF-CANDOUR-969D | MCA-RES-DUTY-OF-CANDOUR | res-duty-of-candour.md |
| MCA-RES-REPORTABLE-INCIDENTS-FA50 | MCA-RES-REPORTABLE-INCIDENTS | res-reportable-incidents.md |
| MCA-DOM-RECRUITMENT-POLICY-5314 | MCA-DOM-RECRUITMENT | dom-recruitment.md |
| MCA-RES-RECRUITMENT-2663 | MCA-RES-RECRUITMENT | res-recruitment.md |
| MCA-DOM-EQUALITY-DIVERSITY-AND-HUMAN-RIGHTS-POLI-73A3 | MCA-DOM-EQUALITY | dom-equality.md |
| MCA-RES-EQUALITY-DIVERSITY-AND-HUMAN-RIGHTS-8D19 | MCA-RES-EQUALITY | res-equality.md |
| MCA-DOM-EMPLOYEE-HANDBOOK-DF84 | MCA-ALL-EMPLOYEE-HANDBOOK | all-employee-handbook.md |

The Employee Handbook is now one version for all services (the old one was
already shown to both but was coded homecare and spoke of residents).

## Errors in the old ones, fixed

- Liberty Protection Safeguards described as coming (Consent ×2, care-home
  Restraint). They are not in force; DoLS sections now point to Deprivation of
  Liberty and the June 2026 Supreme Court judgment and DHSC guidance.
- CQC "Key Lines of Enquiry" (Consent ×2): now the Single Assessment Framework.
- CQC notifications under the 2014 Regulations "16–18" (care-home Reportable
  Incidents): now Regulations 16 and 18 of the CQC (Registration) Regulations
  2009, with Regulation 14 pointed to Registered Manager Absence.
- "In good faith" (Whistleblowing ×2): now reasonable belief and the public
  interest; sexual harassment disclosures added (since 6 April 2026).
- Monthly 1:1 (Employee Handbook): now supervision every three months.
- "Restraint" (care home): now titled Restraint and Restrictive Practice.
- Bedroom cameras with consent only (Safety and Security of Premises): now
  consent, or best interests where the resident lacks capacity, as CCTV says.
- Lone Working linked from care-home Safeguarding: removed.
- IPC outbreak stub: a short "if you suspect an outbreak" section pointing to
  Outbreak Management.

## Where to look hardest

**Law, checked when reviewing**
- Whistleblowing: CQC 03000 616161; Protect 020 3117 2520; prescribed persons
  named are CQC, HSE, the Information Commission, HMRC (minimum wage) and MPs.
- Governance and Complaints: CQC can ask for a Regulation 17 report or a
  complaints summary within 28 days; statement of purpose changes notified
  within 28 days; the rating displayed within 21 days (Regulation 20A).
- Duty of Candour: the harm thresholds for providers that are not health
  service bodies (28 days for impairment and prolonged pain or psychological
  harm); failing to notify is an offence (Regulation 22).
- Medicines (care home): the Safe Custody Regulations apply; a controlled drugs
  register is written as what NICE SC1 recommends, not as law.
- Reportable Incidents (care home): every death in the home is notified; a
  death elsewhere only where it may be linked to our care.
- Recruitment (care home): kitchen and domestic staff who help residents eat
  are treated as in regulated activity (adults' barred list).
- Equality: nothing added on single-sex spaces or the 2025 Supreme Court
  judgment on "sex", matching Saj's decision on Sexuality and Relationships.

**Our own choices — recommended practice a company can change**
- Complaints: acknowledge within 3 working days, respond within 20; a
  second-stage review by the nominated individual on the same timescale.
- Whistleblowing: acknowledge within 5 working days; outcome within 20.
- Duty of Candour: the conversation within 2 working days of deciding the duty
  applies; the letter within 10 working days of it.
- Governance: a monthly quality report to the nominated individual; a
  governance meeting (with the risk register) at least every three months;
  care home: an unannounced night or weekend visit every three months.
- Care planning (care home): a monthly key-worker check on top of the reviews
  the homecare version sets.
- Positive Behaviour Support (care home): all care staff trained at induction,
  not only those supporting someone with a plan.
- Medicines (care home): controlled drugs signed by two staff and checked
  weekly; a monthly audit by the registered manager.
- Safety and Security of Premises: keypad codes changed at least every six
  months; window restrictors and locks checked monthly.
- Recruitment: an application form, not a CV; two interviewers; two
  references; an unexplained gap stops the process.

**Fill-ins** — Employee Handbook: pay date and pension scheme. Complaints: who
reviews at the second stage when the nominated individual is also the
registered manager. Governance: how the company is structured. Safety and
Security of Premises: how the doors are secured. Safeguarding: the local
authority's safeguarding contact.

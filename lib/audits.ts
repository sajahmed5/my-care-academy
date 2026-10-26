/**
 * Audits on a schedule (ROADMAP §4): medication, care plans, infection
 * control. The same engine as spot checks, pointed at the service rather than
 * a person — templated, recurring, and anything that fails becomes an action
 * with an owner and a date.
 *
 * The checklists are a starting point written for a domiciliary or residential
 * service, not regulation text: a provider should read them against their own
 * policies, and a qualified manager signs each audit off. Pure, no I/O.
 */

export type AuditAnswer = "yes" | "no" | "na";

export interface AuditKind {
  key: string;
  label: string;
  /** What it covers, one line. */
  blurb: string;
  /** Months until the next one is due, by default. */
  intervalMonths: number;
  questions: { id: string; text: string }[];
}

export const AUDIT_KINDS: AuditKind[] = [
  {
    key: "medication",
    label: "Medication audit",
    blurb: "MAR charts, storage, stock and PRN, for the service or one person's medicines.",
    intervalMonths: 1,
    questions: [
      { id: "mar_complete", text: "MAR charts are fully completed, with no unexplained gaps" },
      { id: "mar_codes", text: "Any refusal or omission is coded and explained on the MAR" },
      { id: "mar_match", text: "The MAR matches the current prescription and pharmacy label" },
      { id: "prn_protocol", text: "Every 'as required' (PRN) medicine has a written protocol" },
      { id: "prn_recorded", text: "PRN doses record the reason given and the effect" },
      { id: "storage", text: "Medicines are stored securely, as the label directs" },
      { id: "fridge", text: "Fridge temperatures are recorded daily and within range (where used)" },
      { id: "stock", text: "Stock counts balance with what the MAR shows was given" },
      { id: "cd", text: "Controlled drugs are recorded and checked as the policy requires (where used)" },
      { id: "competent", text: "Everyone administering has a current medication competency check" },
      { id: "errors", text: "Any medication error since the last audit was reported and followed up" },
    ],
  },
  {
    key: "care_plan",
    label: "Care plan audit",
    blurb: "Whether a person's plan is current, person-centred and followed.",
    intervalMonths: 3,
    questions: [
      { id: "reviewed", text: "The care plan has been reviewed within its review date" },
      { id: "person_involved", text: "The person (or their representative) was involved and has agreed it" },
      { id: "consent", text: "Consent, or a mental capacity assessment and best-interests decision, is recorded" },
      { id: "needs", text: "Needs, preferences and what matters to the person are clearly described" },
      { id: "risks", text: "Risk assessments are current and match the plan (moving and handling, falls, skin, nutrition)" },
      { id: "outcomes", text: "Goals and outcomes are written down, with how progress is checked" },
      { id: "notes_match", text: "Daily notes show the plan is being followed" },
      { id: "changes", text: "Changes in need since the last review are reflected in the plan" },
      { id: "contacts", text: "Emergency contacts, GP and next of kin details are up to date" },
      { id: "dnacpr", text: "Any DNACPR or advance decision is recorded and easy to find" },
    ],
  },
  {
    key: "infection_control",
    label: "Infection prevention and control audit",
    blurb: "PPE, hand hygiene, cleaning, waste and outbreak readiness.",
    intervalMonths: 3,
    questions: [
      { id: "ppe_stock", text: "PPE is in stock and staff can get it when they need it" },
      { id: "ppe_use", text: "Staff are seen using PPE correctly, and putting it on and taking it off safely" },
      { id: "hand_hygiene", text: "Hand hygiene is carried out at the right moments" },
      { id: "training", text: "Infection prevention and control training is current for all staff" },
      { id: "cleaning", text: "Cleaning schedules are in place and signed off (where the service is responsible)" },
      { id: "waste", text: "Clinical and sharps waste is handled and disposed of safely" },
      { id: "laundry", text: "Soiled laundry is handled to keep it separate and safe (where applicable)" },
      { id: "illness", text: "Staff know not to work while unwell and when to report symptoms" },
      { id: "outbreak", text: "There is an outbreak plan and staff know where it is" },
      { id: "spillage", text: "Spillage kits are available and staff know how to use them" },
    ],
  },
];

export function auditKind(key: string): AuditKind | undefined {
  return AUDIT_KINDS.find((k) => k.key === key);
}

/** What share of the questions that apply were met, as a whole percentage; null when none apply. */
export function auditScore(answers: Record<string, AuditAnswer>): number | null {
  const applicable = Object.values(answers).filter((a) => a === "yes" || a === "no");
  if (applicable.length === 0) return null;
  return Math.round((applicable.filter((a) => a === "yes").length / applicable.length) * 100);
}

/** The questions answered "no": each is a finding to act on. */
export function auditFindings(kind: AuditKind, answers: Record<string, AuditAnswer>): { id: string; text: string }[] {
  return kind.questions.filter((q) => answers[q.id] === "no");
}

/** Every question must be answered before an audit is saved. */
export function unanswered(kind: AuditKind, answers: Record<string, AuditAnswer>): string[] {
  return kind.questions.filter((q) => !answers[q.id]).map((q) => q.text);
}

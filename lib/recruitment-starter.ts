import { ETHNICITY_OPTIONS, MARITAL_STATUS_OPTIONS, PREFER_NOT_TO_SAY, RELIGION_OPTIONS, SEXUAL_ORIENTATION_OPTIONS } from "@/lib/demographics";
import { sanitiseWith, validateSection, type Answers, type FieldError, type FormField, type FormSection } from "@/lib/recruitment-application";

/**
 * The health, equality and DBS form (RECRUITMENT.md, release 5), brought
 * across from MyRoster's starterForm.ts. It comes after the conditional
 * offer: the Equality Act 2010 s.60 bars health questions before one. Left
 * out from MyRoster: the "Meet your carer" profile (MyRoster's family app has
 * no counterpart here) and "how did you hear about us" (asked on the
 * application already).
 */

const withPnts = (list: string[]) => [...list.filter((o) => o !== PREFER_NOT_TO_SAY), PREFER_NOT_TO_SAY];
const detail = (id: string, when: string, label = "Please tell us more"): FormField => ({
  id,
  label,
  type: "longtext",
  required: true,
  showWhen: { field: when, equals: "yes" },
});

export const STARTER_SECTIONS: FormSection[] = [
  {
    id: "stHealth",
    title: "Your health and the job",
    intro:
      "You've been offered the job subject to checks, so we can now ask about your health. We ask only so that we can keep you and the people you care for safe, and make any adjustments you need. Answering yes does NOT automatically affect your offer: most things can be worked around. Your answers are confidential and read only by the office, who will speak to you privately if anything needs talking through.",
    fields: [
      { id: "affectsRole", label: "Do you have any health condition or disability that could affect you doing the job? (Caring involves moving and handling people, bending, being on your feet, travelling between visits and working alone.)", type: "yesno", required: true },
      detail("affectsRoleDetail", "affectsRole"),
      { id: "adjustments", label: "Do you need any adjustments or support to do the job?", type: "yesno", required: true },
      detail("adjustmentsDetail", "adjustments", "What would help?"),
      { id: "backProblems", label: "Have you had back, neck, shoulder or joint problems that could be made worse by lifting or bending?", type: "yesno", required: true },
      detail("backProblemsDetail", "backProblems"),
      { id: "skin", label: "Do you have a skin condition or allergy (for example eczema, dermatitis, latex) that frequent hand-washing or gloves could affect?", type: "yesno", required: true },
      detail("skinDetail", "skin"),
      { id: "suddenIllness", label: "Do you have any condition that can cause sudden loss of consciousness, fits, fainting or dizziness (for example epilepsy, diabetes, a heart condition)?", type: "yesno", required: true, help: "This matters because carers often work alone and may drive between visits." },
      detail("suddenIllnessDetail", "suddenIllness"),
      { id: "medication", label: "Do you take any medication that could affect your alertness or your driving?", type: "yesno", required: true },
      detail("medicationDetail", "medication"),
      { id: "infection", label: "Do you currently have, or have you recently had, an infectious illness that could be passed on to the people you care for?", type: "yesno", required: true },
      detail("infectionDetail", "infection"),
      { id: "mentalHealth", label: "Is there anything about your mental health or wellbeing you'd like us to know, so we can support you?", type: "select", options: ["Yes", "No", PREFER_NOT_TO_SAY], required: true },
      { id: "mentalHealthDetail", label: "Please tell us more", type: "longtext", showWhen: { field: "mentalHealth", equals: "Yes" } },
      { id: "sicknessDays", label: "Roughly how many days were you off sick in the last 12 months?", type: "text", required: true, help: "Write 0 if none." },
      { id: "healthOther", label: "Anything else about your health you'd like us to know", type: "longtext" },
    ],
  },
  {
    id: "stEquality",
    title: "Equality monitoring",
    intro:
      "We ask everybody these questions so we can check we're a fair employer. Every question needs an answer, but “Prefer not to say” is always one of them and is completely fine. Your answers are seen only by the office and play no part in any decision about you: the decision to offer you the job has already been made.",
    fields: [
      { id: "transgender", label: "Do you identify as transgender?", type: "select", required: true, options: ["Yes", "No", PREFER_NOT_TO_SAY] },
      { id: "ethnicity", label: "Ethnic origin", type: "select", required: true, options: withPnts(ETHNICITY_OPTIONS) },
      { id: "religion", label: "Religion or belief", type: "select", required: true, options: withPnts(RELIGION_OPTIONS) },
      { id: "sexualOrientation", label: "Sexual orientation", type: "select", required: true, options: withPnts(SEXUAL_ORIENTATION_OPTIONS) },
      { id: "maritalStatus", label: "Marital status", type: "select", required: true, options: withPnts(MARITAL_STATUS_OPTIONS) },
      { id: "disabled", label: "Do you consider yourself disabled under the Equality Act 2010?", type: "select", required: true, options: ["Yes", "No", PREFER_NOT_TO_SAY] },
    ],
  },
  {
    id: "stDbs",
    title: "Your DBS check",
    intro: "Every carer needs an enhanced DBS check. If you already have one on the Update Service we may be able to use it; otherwise the office will start a new application with you.",
    fields: [
      { id: "hasDbs", label: "Do you already have an enhanced DBS certificate?", type: "yesno", required: true },
      { id: "dbsNumber", label: "Certificate number", type: "text", required: true, showWhen: { field: "hasDbs", equals: "yes" }, help: "12 digits, top right of the certificate." },
      { id: "dbsIssued", label: "Date of issue", type: "date", required: true, showWhen: { field: "hasDbs", equals: "yes" } },
      { id: "dbsWorkforce", label: "Which workforce does it cover?", type: "select", options: ["Adult", "Child", "Adult and child", "Not sure"], required: true, showWhen: { field: "hasDbs", equals: "yes" } },
      { id: "onUpdateService", label: "Are you registered with the DBS Update Service?", type: "yesno", required: true, showWhen: { field: "hasDbs", equals: "yes" } },
      { id: "updateConsent", label: "I give permission for my DBS certificate to be checked online through the Update Service, now and while I work here.", type: "checkbox", required: true, showWhen: { field: "onUpdateService", equals: "yes" } },
      { id: "livedAbroad", label: "In the last five years, have you lived outside the UK for six months or more?", type: "yesno", required: true, help: "If so we may need a certificate of good conduct from that country." },
      detail("livedAbroadDetail", "livedAbroad", "Which country, and when?"),
    ],
  },
  {
    id: "stDeclaration",
    title: "Declaration",
    fields: [
      { id: "declareTrue", label: "I confirm these answers are true and complete. I understand that deliberately false or missing information may lead to my offer being withdrawn, or to dismissal.", type: "checkbox", required: true },
      { id: "tellChanges", label: "I'll tell the office if anything about my health changes that could affect my work.", type: "checkbox", required: true },
    ],
  },
];

export const STARTER_DOC_NOTE = "Online form";

export function validateStarter(answers: Answers, todayIso: string): Record<string, FieldError[]> {
  const out: Record<string, FieldError[]> = {};
  for (const s of STARTER_SECTIONS) {
    const errors = validateSection(s, answers, todayIso);
    if (s.id === "stDbs" && answers.hasDbs === "yes" && typeof answers.dbsNumber === "string" && answers.dbsNumber.trim() && !/^\d{12}$/.test(answers.dbsNumber.replace(/\s+/g, ""))) {
      errors.push({ field: "dbsNumber", message: "A DBS certificate number is 12 digits." });
    }
    if (errors.length) out[s.id] = errors;
  }
  return out;
}

export const sanitiseStarter = (raw: unknown): Answers => sanitiseWith(STARTER_SECTIONS, raw);

/** The yes answers the office should talk through, by their question. */
export function healthFlags(answers: Answers): string[] {
  const health = STARTER_SECTIONS[0].fields;
  return health
    .filter((f) => (f.type === "yesno" && answers[f.id] === "yes") || (f.id === "mentalHealth" && answers[f.id] === "Yes"))
    .map((f) => f.label.replace(/\s*\(.*$/, "").replace(/\?$/, ""));
}

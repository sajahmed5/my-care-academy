import { sanitiseWith, validateSection, type Answers, type FieldError, type FormSection } from "@/lib/recruitment-application";

/**
 * The DBS risk assessment, online (RECRUITMENT.md: "if the DBS shows a
 * conviction, the DBS risk assessment is filled in here"; until 31 Oct 2026
 * it was an upload or held on paper). The questions follow the DBS's own
 * guidance on employing people with a criminal record: what the certificate
 * shows, what they said about it, whether it bears on this job, what would
 * keep people safe, and a decision with its reasons. A company can add its
 * own questions after ours (Settings → HR → Forms and literacy test).
 *
 * Filled in by a manager or the office; the candidate never sees it.
 */

export const DBS_DECISIONS = ["Employ", "Employ with safeguards", "Don't employ"] as const;

export const DBS_RISK_SECTIONS: FormSection[] = [
  {
    id: "drDisclosure",
    title: "What the DBS shows",
    fields: [
      { id: "certificateNumber", label: "DBS certificate number", type: "text", required: true },
      { id: "certificateDate", label: "Date the certificate was issued", type: "date", required: true },
      { id: "offences", label: "What it shows: each offence, its date and the sentence", type: "longtext", required: true },
      { id: "ageAtOffence", label: "How old were they at the time?", type: "text" },
      { id: "declared", label: "Did they tell you about it on their application, before the check came back?", type: "yesno", required: true },
    ],
  },
  {
    id: "drDiscussion",
    title: "Talking it through with them",
    intro: "Always talk to the person before deciding: the certificate doesn't tell you the circumstances.",
    fields: [
      { id: "discussedOn", label: "Date you talked it through", type: "date", required: true },
      { id: "theirAccount", label: "Their account of what happened", type: "longtext", required: true },
      { id: "sinceThen", label: "What has changed since: work, training, support, references", type: "longtext" },
    ],
  },
  {
    id: "drRelevance",
    title: "Does it bear on this job?",
    fields: [
      { id: "relevant", label: "Is the offence relevant to the job: care of vulnerable adults, money, medication, keys, driving?", type: "yesno", required: true },
      { id: "relevantWhy", label: "Why, or why not", type: "longtext", required: true },
      { id: "pattern", label: "Is there a pattern of offending?", type: "yesno", required: true },
      { id: "barred", label: "Are they barred from working with adults (the adults' barred list)?", type: "yesno", required: true, help: "If yes, it is against the law to employ them in regulated activity." },
    ],
  },
  {
    id: "drSafeguards",
    title: "Keeping people safe",
    fields: [
      { id: "safeguards", label: "Safeguards if they are employed: extra supervision, no handling money, shadowing for longer, a review date", type: "longtext" },
      { id: "reviewOn", label: "When the safeguards will be reviewed", type: "date" },
    ],
  },
  {
    id: "drDecision",
    title: "The decision",
    fields: [
      { id: "decision", label: "Decision", type: "select", options: [...DBS_DECISIONS], required: true },
      { id: "reasons", label: "The reasons for the decision", type: "longtext", required: true },
      { id: "assessorName", label: "Assessed by (name)", type: "text", required: true },
      { id: "assessorRole", label: "Their job title", type: "text", required: true },
    ],
  },
];

export const DBS_RISK_CUSTOM_TITLE = "Your company's questions";

export function dbsRiskSections(company: FormSection | null): FormSection[] {
  return company ? [...DBS_RISK_SECTIONS.slice(0, -1), company, DBS_RISK_SECTIONS[DBS_RISK_SECTIONS.length - 1]] : DBS_RISK_SECTIONS;
}

export function validateDbsRisk(answers: Answers, todayIso: string, sections: FormSection[] = DBS_RISK_SECTIONS): Record<string, FieldError[]> {
  const out: Record<string, FieldError[]> = {};
  for (const s of sections) {
    // The review date is ahead of us, which the shared check calls a mistake.
    const errors = validateSection(s, answers, todayIso).filter((e) => !(e.field === "reviewOn" && /future/.test(e.message)));
    if (s.id === "drSafeguards" && answers.decision === "Employ with safeguards" && !String(answers.safeguards ?? "").trim()) {
      errors.push({ field: "safeguards", message: "Say what the safeguards are." });
    }
    if (s.id === "drDecision" && answers.barred === "yes" && answers.decision !== "Don't employ") {
      errors.push({ field: "decision", message: "Someone on the adults' barred list can't be employed in care." });
    }
    if (errors.length) out[s.id] = errors;
  }
  return out;
}

export const sanitiseDbsRisk = (raw: unknown, sections: FormSection[] = DBS_RISK_SECTIONS): Answers => sanitiseWith(sections, raw);

/** The decision as stored: employ, employ_with_safeguards or do_not_employ. */
export function decisionKey(answers: Answers): "employ" | "employ_with_safeguards" | "do_not_employ" | null {
  if (answers.decision === "Employ") return "employ";
  if (answers.decision === "Employ with safeguards") return "employ_with_safeguards";
  if (answers.decision === "Don't employ") return "do_not_employ";
  return null;
}

/** The note on the step once it's finished. */
export function dbsRiskNote(answers: Answers): string {
  const who = String(answers.assessorName ?? "").trim();
  return `${String(answers.decision ?? "No decision")}${who ? ` · assessed by ${who}` : ""}`;
}

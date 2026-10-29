import {
  sanitiseWith,
  validateSection,
  type Answers,
  type Entry,
  type FieldError,
  type FormField,
  type FormSection,
} from "@/lib/recruitment-application";

/**
 * References by link (RECRUITMENT.md, release 4), brought across from
 * MyRoster's referenceForm.ts and references.ts on 29 Oct 2026. The referee
 * answers online from an emailed link, with the candidate's name and date of
 * birth filled in; an employer and a character referee get different forms.
 * Both ask the two questions a care employer must: would you recommend them,
 * and do you know of any reason they shouldn't work with vulnerable people.
 *
 * Pure: the referee's page, the server and the office viewer share it.
 */

export type ReferenceKind = "employer" | "character";
export const REFERENCE_LINK_DAYS = 30;
/** First chase after this many days without an answer (Saj, 29 Oct 2026: three), then again; then the office rings. */
export const REMINDER_AFTER_DAYS = 3;
export const MAX_REMINDERS = 2;

export const kindForType = (refereeType: string | null | undefined): ReferenceKind =>
  refereeType === "Previous employer" ? "employer" : "character";

const RATING = ["Excellent", "Good", "Adequate", "Poor", "Unable to comment"];
const rate = (id: string, label: string): FormField => ({ id, label, type: "select", options: RATING, required: true });

const SUITABILITY: FormSection = {
  id: "refSuitability", title: "Suitability for care work",
  intro: "Carers work alone in the homes of children and adults who may be vulnerable, so these two questions matter most.",
  fields: [
    { id: "recommend", label: "Would you recommend this person for a job as a carer?", type: "yesno", required: true },
    { id: "recommendDetail", label: "Please tell us why not", type: "longtext", required: true, showWhen: { field: "recommend", equals: "no" } },
    { id: "safeguardingConcern", label: "Do you know of any reason why this person should not work with children or vulnerable adults?", type: "yesno", required: true },
    { id: "safeguardingDetail", label: "Please give details", type: "longtext", required: true, showWhen: { field: "safeguardingConcern", equals: "yes" } },
    { id: "comments", label: "Anything else you would like to tell us", type: "longtext" },
  ],
};

const DECLARATION: FormSection = {
  id: "refDeclaration", title: "About you",
  fields: [
    { id: "refereeName", label: "Your full name", type: "text", required: true, autoComplete: "name" },
    { id: "refereeRole", label: "Your job title or role", type: "text", required: true },
    { id: "refereeOrganisation", label: "Organisation", type: "text" },
    { id: "refereePhone", label: "A phone number we can reach you on", type: "tel", required: true, help: "We may ring to confirm this reference came from you." },
    { id: "declare", label: "I confirm this reference is true and accurate to the best of my knowledge, and that I am the person it was requested from.", type: "checkbox", required: true },
  ],
};

export const REFERENCE_SECTIONS: Record<ReferenceKind, FormSection[]> = {
  employer: [
    {
      id: "refEmployment", title: "Their employment with you",
      fields: [
        { id: "employedFrom", label: "Employed from", type: "month", required: true },
        { id: "employedTo", label: "Employed to", type: "month", required: true, allowCurrent: "They still work here" },
        { id: "jobTitle", label: "Their job title", type: "text", required: true },
        // Saj, 5 Oct 2026: a relative who once employed them is still a relative — asked of every referee.
        { id: "related", label: "Are you related to this person, or their partner?", type: "yesno", required: true },
        { id: "natureOfWork", label: "Nature of the work", type: "longtext" },
        { id: "reasonForLeaving", label: "Reason for leaving", type: "select", options: ["Still employed", "Resigned", "End of contract", "Redundancy", "Illness", "Underperformance", "Dismissed", "Personal reasons", "Other"], required: true },
        { id: "reasonDetail", label: "Any detail on the reason for leaving", type: "longtext" },
        { id: "disciplinary", label: "Was this person the subject of any disciplinary procedure while employed?", type: "yesno", required: true },
        { id: "disciplinaryDetail", label: "Please give details", type: "longtext", required: true, showWhen: { field: "disciplinary", equals: "yes" } },
        { id: "sicknessPeriods", label: "How many periods of sickness absence did they have in their last year?", type: "text" },
        { id: "reEmploy", label: "Would you re-employ this person?", type: "yesno", required: true },
        { id: "reEmployDetail", label: "Please tell us why not", type: "longtext", required: true, showWhen: { field: "reEmploy", equals: "no" } },
      ],
    },
    {
      id: "refCompetencies", title: "How would you rate them?",
      fields: [
        rate("ratePlanning", "Ability to plan, structure and prioritise their own work"),
        rate("rateLearning", "Ability to learn from situations and past experience"),
        rate("rateFlexible", "Ability to be flexible and adapt to new ways of working"),
        rate("rateHardWork", "Ability to work hard to achieve objectives and goals"),
        rate("rateCalm", "Capacity to remain calm under pressure"),
        rate("rateTeam", "Willingness to work together as a team"),
        rate("rateInitiative", "Ability to use their own initiative"),
        rate("rateCommunicates", "Ability to communicate potential issues before they arise"),
        rate("rateTimekeeping", "Time-keeping"),
      ],
    },
    SUITABILITY, DECLARATION,
  ],
  character: [
    {
      id: "refKnown", title: "How you know them",
      fields: [
        { id: "knownHow", label: "In what capacity do you know this person?", type: "text", required: true, help: "For example teacher, tutor, colleague, neighbour, family friend." },
        { id: "knownYears", label: "How long have you known them?", type: "text", required: true },
        { id: "related", label: "Are you related to them?", type: "yesno", required: true },
        { id: "character", label: "How would you describe their character?", type: "longtext", required: true },
      ],
    },
    {
      id: "refCompetencies", title: "How would you rate them?",
      fields: [
        rate("rateReliable", "Reliability"),
        rate("rateHonest", "Honesty and trustworthiness"),
        rate("rateCalm", "Capacity to remain calm under pressure"),
        rate("rateTeam", "Getting on with other people"),
        rate("rateTimekeeping", "Time-keeping"),
      ],
    },
    SUITABILITY, DECLARATION,
  ],
};

/** Our sections with the company's own questions before "About you" (release 7). */
export function referenceSections(kind: ReferenceKind, company: FormSection | null): FormSection[] {
  const ours = REFERENCE_SECTIONS[kind];
  if (!company) return ours;
  const at = ours.findIndex((s) => s.id === "refDeclaration");
  return at < 0 ? [...ours, company] : [...ours.slice(0, at), company, ...ours.slice(at)];
}

export function validateReference(kind: ReferenceKind, answers: Answers, todayIso: string, sections: FormSection[] = REFERENCE_SECTIONS[kind]): Record<string, FieldError[]> {
  const out: Record<string, FieldError[]> = {};
  for (const s of sections) {
    const errors = validateSection(s, answers, todayIso);
    if (errors.length) out[s.id] = errors;
  }
  return out;
}

export const sanitiseReference = (kind: ReferenceKind, raw: unknown, sections: FormSection[] = REFERENCE_SECTIONS[kind]): Answers => sanitiseWith(sections, raw);

/** Anything in a received reference the office should look at first. */
export function referenceFlags(kind: ReferenceKind, answers: Answers): string[] {
  const flags: string[] = [];
  if (answers.recommend === "no") flags.push("Would NOT recommend for a job as a carer");
  if (answers.safeguardingConcern === "yes") flags.push("Raised a reason they should not work with children or vulnerable adults");
  if (answers.reEmploy === "no") flags.push("Would not re-employ");
  if (answers.disciplinary === "yes") flags.push("Disciplinary procedure while employed");
  if (answers.reasonForLeaving === "Dismissed" || answers.reasonForLeaving === "Underperformance") flags.push(`Reason for leaving: ${answers.reasonForLeaving}`);
  if (answers.related === "yes") flags.push("Referee is related to the candidate");
  const poor = REFERENCE_SECTIONS[kind].find((s) => s.id === "refCompetencies")?.fields.filter((f) => answers[f.id] === "Poor").map((f) => f.label) ?? [];
  if (poor.length) flags.push(`Rated Poor: ${poor.join("; ")}`);
  return flags;
}

const FREE_WEBMAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "live.co.uk", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "aol.com", "btinternet.com", "sky.com",
  "virginmedia.com", "talktalk.net", "protonmail.com", "proton.me", "gmx.com", "mail.com",
]);

/**
 * The candidate supplies the referee's address, so a personal mailbox given for
 * an EMPLOYER is worth a phone call before it is trusted — it is the obvious
 * way to write your own reference.
 */
export function isFreeWebmail(email: string | null | undefined): boolean {
  const domain = String(email ?? "").trim().toLowerCase().split("@")[1];
  return !!domain && FREE_WEBMAIL.has(domain);
}

export type ReferenceStatus = "not_requested" | "requested" | "received" | "unusable";

/** Is a chase email due? Pure, so the cron's judgement is tested. */
export function reminderDue(r: { status: string; requested_at: string | null; last_reminded_at: string | null; reminder_count: number; token_expires_at: string | null }, now: number): boolean {
  if (r.status !== "requested" || !r.requested_at) return false;
  if (r.reminder_count >= MAX_REMINDERS) return false;
  if (r.token_expires_at && new Date(r.token_expires_at).getTime() <= now) return false;
  const since = new Date(r.last_reminded_at ?? r.requested_at).getTime();
  return now - since >= REMINDER_AFTER_DAYS * 86_400_000;
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "") || null;

/** A referee as typed on the application form → a row. The employer goes first. */
export function refereeRowsFromApplication(referees: Entry[]): Array<Record<string, unknown>> {
  const ordered = [...referees].sort((a, b) => Number(b.type === "Previous employer") - Number(a.type === "Previous employer"));
  return ordered.slice(0, 3).map((r, i) => ({
    position: i + 1,
    referee_type: text(r.type) ?? "Character reference",
    referee_name: text(r.name) ?? "Referee",
    referee_position: text(r.position),
    organisation: text(r.organisation),
    email: text(r.email)?.toLowerCase() ?? null,
    phone: text(r.phone, 40),
    relationship: text(r.relationship),
    candidate_job_title: text(r.yourJobTitle),
    employed_from: text(r.from, 10),
    employed_to: text(r.to, 10),
  }));
}


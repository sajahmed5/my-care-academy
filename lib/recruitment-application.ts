import { GENDER_OPTIONS, LANGUAGE_OPTIONS, PREFER_NOT_TO_SAY, tidyLanguage } from "@/lib/demographics";
import { ROLES, SOURCES } from "@/lib/recruitment";
/**
 * Brought across from MyRoster (src/lib/recruitment/applicationForm.ts) on
 * 29 Oct 2026, with HG Care's own wording made neutral and two questions
 * added: the role applied for and where they heard about it.
 *
 * The online application form — what is asked, and whether an answer set is
 * complete. PURE (no I/O, no React): the candidate's page renders it, the
 * server re-validates with the very same function before accepting a submit,
 * and the office viewer reads the same definition to lay the answers out.
 *
 * Reviewed with Saj (HR) on 21 Sept 2026 against the paper form PR23:
 *  - NO health questions here. The Equality Act 2010 s.60 bars them before a
 *    job offer; they move to a "health and equality" form in stage 2, after
 *    the offer. Equal opportunities moves there with them (Saj: one form, so
 *    the staff record holds it) — so neither is asked on the application.
 *  - TEN years of employment history (Saj's decision; the paper form asked
 *    five), and every gap over a month must be given a reason.
 *  - "Have you been employed before?" sets the references rule: yes = two
 *    referees, one of them their most recent employer; no = three.
 *  - Availability is a grid, Monday–Sunday × "Morning & Lunch" / "Tea & Bed" —
 *    the way rounds are actually staffed — not "full time / part time".
 *  - Convictions ARE asked (lawful: the role is exempt from the Rehabilitation
 *    of Offenders Act), worded for DBS filtering.
 *  - TEN years of address history (the DBS needs five).
 */

export type FieldType =
  | "text" | "longtext" | "email" | "tel" | "date" | "month" | "number"
  | "yesno" | "select" | "multiselect" | "matrix" | "checkbox" | "info" | "repeat";

export interface ShowWhen { field: string; equals: string }

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  options?: string[];
  /** For type "matrix": a tick-grid. The answer is a list of "row|column". */
  matrix?: { rows: string[]; columns: string[] };
  showWhen?: ShowWhen;
  /** For type "month": an "I still work / live here" tick that stands in for a date. */
  allowCurrent?: string;
  /** For type "repeat": the fields of one entry. */
  fields?: FormField[];
  /** For type "repeat": what one entry is called on the Add button. */
  itemLabel?: string;
  autoComplete?: string;
}

export interface FormSection {
  id: string;
  title: string;
  intro?: string;
  fields: FormField[];
}

export type Entry = Record<string, string | string[] | boolean | undefined>;
export type Answers = Record<string, string | string[] | boolean | Entry[] | undefined>;

export const CURRENT = "current";
/** The note on the pending "Application Form" document a submit files — how the
 *  office page tells an online application from an uploaded paper one. */
export const APPLICATION_DOC_NOTE = "Online application form";
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const SHIFTS = ["Morning & Lunch", "Tea & Bed"];
/** How far back the employment and address history must reach. */
export const HISTORY_MONTHS = 120;

export const REFEREE_TYPES = ["Previous employer", "School, college or university", "Character reference"] as const;

/** How a candidate would get to visits — the company's travel types, as the carer record stores them. */
export const APPLICATION_TRAVEL_TYPES = ["Driver", "Walker", "Public Transport", "Bike"];

/**
 * What the application says about the person that belongs on their staff
 * record — BLANKS only are ever filled from it. "Prefer not to say" is an
 * answer to the question, not a fact for the record.
 */
export function applicationForRecord(answers: Answers): { gender?: string; travel_type?: string; languages?: string[] } {
  const out: { gender?: string; travel_type?: string; languages?: string[] } = {};
  if (typeof answers.gender === "string" && answers.gender && answers.gender !== PREFER_NOT_TO_SAY) out.gender = answers.gender;
  if (typeof answers.travelType === "string" && APPLICATION_TRAVEL_TYPES.includes(answers.travelType)) out.travel_type = answers.travelType;
  const ticked = Array.isArray(answers.languagesSpoken) ? (answers.languagesSpoken as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const other = typeof answers.languagesOther === "string" ? answers.languagesOther.split(",").map((l) => tidyLanguage(l)).filter(Boolean) : [];
  const all = [...ticked, ...other].filter((l, i, list) => list.findIndex((m) => m.toLowerCase() === l.toLowerCase()) === i);
  if (all.length) out.languages = all;
  return out;
}

export const APPLICATION_SECTIONS: FormSection[] = [
  {
    id: "about", title: "About you",
    fields: [
      { id: "title", label: "Title", type: "select", options: ["Mr", "Mrs", "Miss", "Ms", "Mx", "Other"] },
      { id: "firstName", label: "First name", type: "text", required: true, autoComplete: "given-name" },
      { id: "otherNames", label: "Other names", type: "text" },
      { id: "surname", label: "Surname", type: "text", required: true, autoComplete: "family-name" },
      { id: "dob", label: "Date of birth", type: "date", required: true, autoComplete: "bday" },
      // Saj, 22 Sept 2026: mandatory going forward — a fact about who is applying, not an equality
      // question. Ethnicity, religion, sexual orientation and marital status stay in stage 2, after the
      // decision to offer has been made, so nobody shortlisting can see them.
      { id: "gender", label: "Gender", type: "select", required: true, options: [...GENDER_OPTIONS, PREFER_NOT_TO_SAY] },
      { id: "mobile", label: "Mobile number", type: "tel", required: true, autoComplete: "tel" },
      { id: "landline", label: "Landline", type: "tel" },
      { id: "email", label: "Email address", type: "email", required: true, autoComplete: "email" },
      { id: "nationality", label: "Nationality", type: "text" },
      { id: "cityOfBirth", label: "Town or city of birth", type: "text" },
      { id: "countryOfBirth", label: "Country of birth", type: "text" },
      { id: "nameChanged", label: "Have you ever changed your first name or surname? (marriage, deed poll, adoption)", type: "yesno", required: true },
      { id: "previousName", label: "Previous name(s)", type: "text", required: true, showWhen: { field: "nameChanged", equals: "yes" } },
      { id: "yearChanged", label: "Year changed", type: "text", showWhen: { field: "nameChanged", equals: "yes" } },
    ],
  },
  {
    id: "work", title: "Working with us",
    fields: [
      { id: "roleApplied", label: "Which job are you applying for?", type: "select", required: true, options: ROLES },
      { id: "heardFrom", label: "Where did you hear about this job?", type: "select", options: SOURCES },
      { id: "rightToWork", label: "Do you have the legal right to work in the UK?", type: "yesno", required: true, help: "We will ask for proof later — a passport, or a share code from gov.uk." },
      { id: "drivingLicence", label: "Do you hold a full UK driving licence?", type: "yesno", required: true },
      { id: "carAccess", label: "Do you have access to a car for work?", type: "yesno", required: true },
      { id: "travelType", label: "How would you get to your visits?", type: "select", required: true, options: APPLICATION_TRAVEL_TYPES, help: "We plan rotas around this, so walkers and bus users are given visits close together." },
      { id: "availability", label: "When are you available to work?", type: "matrix", matrix: { rows: DAYS, columns: SHIFTS }, required: true, help: "Tick every part of the week you could work — both on the same day if you can do both." },
      { id: "preferredAreas", label: "Which areas can you work in?", type: "longtext", required: true, help: "The towns or neighbourhoods you could travel to for visits." },
    ],
  },
  {
    id: "address", title: "Your address",
    intro: "We need your addresses for the last ten years.",
    fields: [
      { id: "address1", label: "Address line 1", type: "text", required: true, autoComplete: "address-line1" },
      { id: "address2", label: "Address line 2", type: "text", autoComplete: "address-line2" },
      { id: "city", label: "Town or city", type: "text", required: true, autoComplete: "address-level2" },
      { id: "postcode", label: "Postcode", type: "text", required: true, autoComplete: "postal-code" },
      { id: "movedIn", label: "When did you move in?", type: "month", required: true },
      {
        id: "previousAddresses", label: "Previous addresses", type: "repeat", itemLabel: "previous address",
        help: "Only needed if you have lived at your current address for less than ten years.",
        fields: [
          { id: "address1", label: "Address line 1", type: "text", required: true },
          { id: "address2", label: "Address line 2", type: "text" },
          { id: "city", label: "Town or city", type: "text", required: true },
          { id: "postcode", label: "Postcode", type: "text", required: true },
          { id: "from", label: "Moved in", type: "month", required: true },
          { id: "to", label: "Moved out", type: "month", required: true },
        ],
      },
    ],
  },
  {
    id: "experience", title: "Care experience",
    fields: [
      { id: "careExperience", label: "Do you have any experience in care? Tell us about it.", type: "longtext", help: "Paid or unpaid — including caring for a relative. None is needed to apply." },
      { id: "whyCarer", label: "Why do you want to work in care?", type: "longtext", required: true },
    ],
  },
  {
    id: "nextOfKin", title: "Next of kin",
    intro: "Someone we can contact in an emergency.",
    fields: [
      { id: "kinName", label: "Name", type: "text", required: true },
      { id: "kinRelationship", label: "Relationship to you", type: "text", required: true },
      { id: "kinMobile", label: "Mobile number", type: "tel", required: true },
      { id: "kinDaytime", label: "Daytime phone", type: "tel" },
      { id: "kinEmail", label: "Email address", type: "email" },
      { id: "kinAddress", label: "Address", type: "longtext" },
    ],
  },
  {
    id: "education", title: "Education and training",
    fields: [
      { id: "school", label: "School attended", type: "text" },
      { id: "mathsGrade", label: "Maths GCSE (or equivalent) — grade", type: "text" },
      { id: "englishGrade", label: "English GCSE (or equivalent) — grade", type: "text" },
      {
        id: "qualifications", label: "Other qualifications (A-level, BTEC, NVQ, degree…)", type: "repeat", itemLabel: "qualification",
        fields: [
          { id: "institution", label: "School, college or provider", type: "text", required: true },
          { id: "qualification", label: "Qualification", type: "text", required: true },
          { id: "year", label: "Year", type: "text" },
          { id: "result", label: "Result", type: "text" },
        ],
      },
      { id: "languagesSpoken", label: "Which languages do you speak?", type: "multiselect", required: true, options: LANGUAGE_OPTIONS, help: "Tick every one. Many of the people we support are more comfortable in their first language." },
      { id: "languagesOther", label: "Any other languages", type: "text", help: "Not in the list? Type them here, separated by commas." },
      { id: "languages", label: "Anything to add about your languages — for example which are fluent and which conversational", type: "longtext" },
      { id: "otherTraining", label: "Any other training or voluntary work", type: "longtext" },
    ],
  },
  {
    id: "employment", title: "Employment history",
    intro: "We need your employment history for the last ten years (or since you left full-time education, if that is more recent). If there is a break between jobs you will be asked to give the reason. Start with your most recent job.",
    fields: [
      { id: "everEmployed", label: "Have you been employed before?", type: "yesno", required: true },
      { id: "leftEducation", label: "When did you leave full-time education?", type: "month", required: true, help: "So we don't ask you to explain time you spent at school or college." },
      {
        id: "jobs", label: "Your jobs", type: "repeat", itemLabel: "job", showWhen: { field: "everEmployed", equals: "yes" },
        fields: [
          { id: "employer", label: "Employer", type: "text", required: true },
          { id: "role", label: "Your job title", type: "text", required: true },
          { id: "from", label: "Started", type: "month", required: true },
          { id: "to", label: "Left", type: "month", required: true, allowCurrent: "I still work here" },
          { id: "careRole", label: "Did this job involve working with children or vulnerable adults?", type: "yesno", required: true },
          { id: "duties", label: "Duties and responsibilities", type: "longtext" },
          { id: "reasonForLeaving", label: "Reason for leaving", type: "text", required: true, help: "Write “still employed” if you have not left." },
        ],
      },
      { id: "gapExplanation", label: "Please give the reason for each break in your employment", type: "longtext", help: "For example: raising children, studying, travelling, unemployed and looking for work, caring for a relative." },
    ],
  },
  {
    id: "references", title: "References",
    intro: "We will contact these people for a reference. If you have been employed before we need two referees, and one MUST be your most recent employer. If you have never been employed we need three — for example a teacher, tutor or someone who knows you well (not a relative).",
    fields: [
      {
        id: "referees", label: "Your referees", type: "repeat", itemLabel: "referee",
        fields: [
          { id: "type", label: "What kind of reference is this?", type: "select", options: [...REFEREE_TYPES], required: true },
          { id: "name", label: "Their title and name", type: "text", required: true },
          { id: "position", label: "Their job title", type: "text" },
          { id: "organisation", label: "Organisation", type: "text" },
          { id: "email", label: "Their email address", type: "email", required: true, help: "A work email address where possible." },
          { id: "phone", label: "Their phone number", type: "tel", required: true },
          { id: "relationship", label: "How do they know you?", type: "text", required: true },
          { id: "yourJobTitle", label: "Your job title there", type: "text", showWhen: { field: "type", equals: "Previous employer" } },
          { id: "from", label: "You started there", type: "month", showWhen: { field: "type", equals: "Previous employer" } },
          { id: "to", label: "You left", type: "month", allowCurrent: "I still work here", showWhen: { field: "type", equals: "Previous employer" } },
        ],
      },
    ],
  },
  {
    id: "convictions", title: "Criminal record declaration",
    intro: "Caring means working with children and adults who may be vulnerable, so this job is exempt from the Rehabilitation of Offenders Act 1974 and needs an enhanced DBS check. You must tell us about any convictions, cautions, reprimands or final warnings that are NOT “protected”. Protected (filtered) cautions and convictions do not need to be declared — search “DBS filtering guide” on gov.uk if you are unsure. A criminal record does not automatically stop you becoming a carer; we consider each case on its own.",
    fields: [
      { id: "hasConvictions", label: "Do you have any convictions, cautions, reprimands or final warnings that are not protected?", type: "yesno", required: true },
      { id: "convictionDetails", label: "Please give details, with dates", type: "longtext", required: true, showWhen: { field: "hasConvictions", equals: "yes" } },
      { id: "underInvestigation", label: "Are you currently under investigation by the police, or subject to any pending prosecution?", type: "yesno", required: true },
      { id: "investigationDetails", label: "Please give details", type: "longtext", required: true, showWhen: { field: "underInvestigation", equals: "yes" } },
      { id: "onUpdateService", label: "Are you registered with the DBS Update Service?", type: "yesno" },
    ],
  },
  {
    id: "declaration", title: "Declaration",
    fields: [
      { id: "declareTrue", label: "I declare that everything in this application is true and complete. I understand that false or missing information may lead to my application being refused, or to dismissal.", type: "checkbox", required: true },
      { id: "consentReferees", label: "I agree to the people I have named being contacted for a reference.", type: "checkbox", required: true },
      { id: "consentData", label: "I understand my application will be kept securely and used only for recruitment; if I am unsuccessful it is deleted after 6 months.", type: "checkbox", required: true },
    ],
  },
];

// ─── Dates ──────────────────────────────────────────────────────────────────

/** "2024-03" → months since year 0, or null. */
export function monthIndex(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return Number(m[1]) * 12 + (month - 1);
}
const todayMonth = (todayIso: string) => monthIndex(todayIso.slice(0, 7)) as number;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const formatMonth = (index: number) => `${MONTHS[index % 12]} ${Math.floor(index / 12)}`;

export interface Gap { from: number; to: number; months: number; label: string }

/**
 * Gaps of MORE THAN ONE MONTH between leaving education and today that no job
 * covers. A job ending in March and the next starting in April is continuous;
 * ending March, starting May leaves April — one month — which is let through;
 * ending March, starting June is a two-month gap and must be explained.
 */
export function employmentGaps(answers: Answers, todayIso: string): Gap[] {
  const left = monthIndex(answers.leftEducation);
  if (left === null) return [];
  const now = todayMonth(todayIso);
  // Ten years back, or since they left education if that is more recent.
  const start = Math.max(left, now - HISTORY_MONTHS);
  const jobs = (Array.isArray(answers.jobs) && answers.everEmployed === "yes" ? (answers.jobs as Entry[]) : [])
    .map((j) => ({ from: monthIndex(j.from), to: j.to === CURRENT ? now : monthIndex(j.to) }))
    .filter((j): j is { from: number; to: number } => j.from !== null && j.to !== null && j.to >= j.from)
    .sort((a, b) => a.from - b.from);

  const gaps: Gap[] = [];
  let covered = start; // everything up to and including this month is accounted for
  const push = (from: number, to: number) => {
    const months = to - from + 1;
    if (months > 1) gaps.push({ from, to, months, label: `${formatMonth(from)} to ${formatMonth(to)} (${months} months)` });
  };
  for (const j of jobs) {
    if (j.to < start) continue; // wholly before the window
    if (j.from > covered + 1) push(covered + 1, j.from - 1);
    covered = Math.max(covered, j.to);
  }
  if (now > covered + 1) push(covered + 1, now - 1);
  return gaps;
}

/** Two referees if they have worked (one a previous employer); three if never. */
export function refereesRequired(answers: Answers): { count: number; needsEmployer: boolean } {
  return answers.everEmployed === "no" ? { count: 3, needsEmployer: false } : { count: 2, needsEmployer: true };
}

/** How many months short of ten years the address history is (0 = enough). */
export function addressHistoryShortBy(answers: Answers, todayIso: string): number {
  const need = todayMonth(todayIso) - HISTORY_MONTHS;
  const starts = [monthIndex(answers.movedIn), ...((answers.previousAddresses as Entry[] | undefined) ?? []).map((a) => monthIndex(a.from))]
    .filter((n): n is number => n !== null);
  if (!starts.length) return HISTORY_MONTHS;
  return Math.max(0, Math.min(...starts) - need);
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface FieldError { field: string; message: string }

export const cellKey = (row: string, column: string) => `${row}|${column}`;
const validCell = (f: FormField, v: string) => {
  const [row, column, ...rest] = v.split("|");
  return rest.length === 0 && !!f.matrix && f.matrix.rows.includes(row) && f.matrix.columns.includes(column);
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isBlank = (v: unknown) => v === undefined || v === null || v === false || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
export const isShown = (f: FormField, scope: Record<string, unknown>) => !f.showWhen || scope[f.showWhen.field] === f.showWhen.equals;

function checkField(f: FormField, value: unknown, path: string, errors: FieldError[], todayIso: string) {
  if (f.type === "info" || f.type === "repeat") return;
  if (isBlank(value)) {
    if (f.required) errors.push({ field: path, message: f.type === "checkbox" ? "Please tick to confirm." : "Please answer this." });
    return;
  }
  if (f.type === "email" && !EMAIL.test(String(value).trim())) errors.push({ field: path, message: "That doesn't look like an email address." });
  if (f.type === "month" && value !== CURRENT) {
    const idx = monthIndex(value);
    if (idx === null) errors.push({ field: path, message: "Choose a month and year." });
    else if (idx > todayMonth(todayIso)) errors.push({ field: path, message: "That date is in the future." });
  }
  if (f.type === "date") {
    const s = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) errors.push({ field: path, message: "Enter a full date." });
    else if (s > todayIso) errors.push({ field: path, message: "That date is in the future." });
  }
  if (f.type === "matrix" && f.matrix) {
    const ok = Array.isArray(value) && value.every((v) => typeof v === "string" && validCell(f, v));
    if (!ok) errors.push({ field: path, message: "Tick the times you can work." });
  }
  if (f.type === "number" && !(Number(value) > 0 && Number(value) <= 80)) errors.push({ field: path, message: "Enter a number of hours between 1 and 80." });
  if (f.type === "select" && f.options && !f.options.includes(String(value))) errors.push({ field: path, message: "Choose one of the options." });
  if (f.type === "yesno" && value !== "yes" && value !== "no") errors.push({ field: path, message: "Choose yes or no." });
}

/**
 * Every problem in one section. Used as the candidate moves between sections
 * (so they fix things where they are) and, across all sections, by the server
 * before it accepts a submit.
 */
export function validateSection(section: FormSection, answers: Answers, todayIso: string): FieldError[] {
  const errors: FieldError[] = [];
  for (const f of section.fields) {
    if (!isShown(f, answers)) continue;
    if (f.type === "repeat") {
      const entries = (Array.isArray(answers[f.id]) ? answers[f.id] : []) as Entry[];
      entries.forEach((entry, i) => {
        for (const sub of f.fields ?? []) {
          if (!isShown(sub, entry)) continue;
          checkField(sub, entry[sub.id], `${f.id}.${i}.${sub.id}`, errors, todayIso);
        }
        const from = monthIndex(entry.from), to = entry.to === CURRENT ? todayMonth(todayIso) : monthIndex(entry.to);
        if (from !== null && to !== null && to < from) errors.push({ field: `${f.id}.${i}.to`, message: "This is before the start date." });
      });
      continue;
    }
    checkField(f, answers[f.id], f.id, errors, todayIso);
  }

  if (section.id === "about" && typeof answers.dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(answers.dob)) {
    const age = (Date.parse(todayIso) - Date.parse(answers.dob)) / (365.25 * 86_400_000);
    if (age < 16) errors.push({ field: "dob", message: "You must be at least 16 to apply." });
  }
  if (section.id === "address") {
    const short = addressHistoryShortBy(answers, todayIso);
    if (monthIndex(answers.movedIn) !== null && short > 0) {
      errors.push({ field: "previousAddresses", message: `We need ten years of addresses — add where you lived before (${short} more month${short === 1 ? "" : "s"} to cover).` });
    }
  }
  if (section.id === "employment") {
    if (answers.everEmployed === "yes" && !((answers.jobs as Entry[] | undefined)?.length)) {
      errors.push({ field: "jobs", message: "Add at least one job." });
    }
    if (employmentGaps(answers, todayIso).length && isBlank(answers.gapExplanation)) {
      errors.push({ field: "gapExplanation", message: "Please give the reason for each break listed above." });
    }
  }
  if (section.id === "references") {
    const { count, needsEmployer } = refereesRequired(answers);
    const referees = (Array.isArray(answers.referees) ? answers.referees : []) as Entry[];
    if (referees.length < count) errors.push({ field: "referees", message: `We need ${count} referees — you have added ${referees.length}.` });
    if (needsEmployer && referees.length >= count && !referees.some((r) => r.type === "Previous employer")) {
      errors.push({ field: "referees", message: "One referee must be your most recent employer — choose “Previous employer” for them." });
    }
    const own = String(answers.email ?? "").trim().toLowerCase();
    const seen = new Set<string>();
    referees.forEach((r, i) => {
      const email = String(r.email ?? "").trim().toLowerCase();
      if (!email) return;
      if (email === own) errors.push({ field: `referees.${i}.email`, message: "This is your own email address — we need your referee's." });
      if (seen.has(email)) errors.push({ field: `referees.${i}.email`, message: "You have already given this referee." });
      seen.add(email);
    });
  }
  return errors;
}

export function validateApplication(answers: Answers, todayIso: string): Record<string, FieldError[]> {
  const out: Record<string, FieldError[]> = {};
  for (const s of APPLICATION_SECTIONS) {
    const errors = validateSection(s, answers, todayIso);
    if (errors.length) out[s.id] = errors;
  }
  return out;
}

// ─── Storage shape ──────────────────────────────────────────────────────────

const allowedIds = (s: FormSection) => new Set(s.fields.map((f) => f.id));

/**
 * What may be STORED from what a browser sent: only ids the form defines, only
 * the shapes it expects, with long text capped.
 */
export function sanitiseAnswers(raw: unknown): Answers {
  return sanitiseWith(APPLICATION_SECTIONS, raw);
}

/** The same rule for any form built from these field types (the referee form uses it). */
export function sanitiseWith(sections: FormSection[], raw: unknown): Answers {
  const out: Answers = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  const clean = (f: FormField, v: unknown): string | string[] | boolean | undefined => {
    if (f.type === "checkbox") return v === true ? true : undefined;
    if (f.type === "matrix") {
      const cells = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && validCell(f, x)))] : [];
      return cells.length ? cells : undefined;
    }
    if (f.type === "multiselect") return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && (f.options ?? []).includes(x)) : undefined;
    if (typeof v !== "string") return undefined;
    // Long answers keep their line breaks; everything else is one tidy line
    // (pasted tabs and doubled spaces have broken matching here before).
    const s = (f.type === "longtext" ? v.replace(/[ \t]+/g, " ") : v.replace(/\s+/g, " ")).trim().slice(0, f.type === "longtext" ? 3000 : 200);
    return s || undefined;
  };
  for (const section of sections) {
    const ids = allowedIds(section);
    for (const f of section.fields) {
      if (!ids.has(f.id) || f.type === "info") continue;
      if (f.type === "repeat") {
        const list = Array.isArray(src[f.id]) ? (src[f.id] as unknown[]).slice(0, 30) : [];
        const entries = list
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => {
            const entry: Entry = {};
            for (const sub of f.fields ?? []) {
              const val = clean(sub, e[sub.id]);
              if (val !== undefined) entry[sub.id] = val;
            }
            return entry;
          });
        if (entries.length) out[f.id] = entries;
        continue;
      }
      const val = clean(f, src[f.id]);
      if (val !== undefined) out[f.id] = val;
    }
  }
  return out;
}

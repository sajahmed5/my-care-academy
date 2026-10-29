import { sanitiseWith, validateSection, type Answers, type FieldError, type FormField, type FormSection } from "@/lib/recruitment-application";

/**
 * The shadowing record (RECRUITMENT.md, release 6): the mentor's feedback on
 * a candidate's shadowing shift, brought across from MyRoster's shadowing.ts
 * (HG Care's paper SP07). MyRoster also ties shadowing to rostered visits;
 * there are no visits here, so it's the form only, filled in by the office
 * from the mentor or by the mentor at the office's computer.
 */

const yn = (id: string, label: string): FormField[] => [
  { id, label, type: "yesno", required: true },
  { id: `${id}Comment`, label: "Comments", type: "longtext" },
];

export const SHADOWING_SECTIONS: FormSection[] = [
  {
    id: "shAbout",
    title: "The shift",
    fields: [
      { id: "shadowDate", label: "Date of the shadowing shift", type: "date", required: true },
      { id: "mentorName", label: "Mentor's name", type: "text", required: true },
      { id: "mentorRole", label: "Mentor's job title", type: "text", required: true },
    ],
  },
  {
    id: "shDay",
    title: "On the day",
    fields: [
      ...yn("onTime", "Did they meet the mentor at the right time?"),
      ...yn("uniform", "Were they in uniform (if they've been given one)?"),
      ...yn("presentable", "Were they clean and presentable?"),
      { id: "visitsCount", label: "How many people did they visit with the mentor?", type: "number", required: true },
    ],
  },
  {
    id: "shCare",
    title: "With the people we support",
    fields: [
      ...yn("assisted", "Did they help with any tasks?"),
      ...yn("standard", "Did they carry those tasks out to a satisfactory standard?"),
      ...yn("respectful", "Were they polite and respectful to the people visited?"),
      ...yn("spoke", "Did they talk to the people visited?"),
      ...yn("communicated", "Did they communicate clearly: could people understand them, and they understand people?"),
      ...yn("equipment", "Did they seem capable of using equipment safely?"),
    ],
  },
  {
    id: "shLearning",
    title: "Learning",
    fields: [
      ...yn("shownFile", "Were they shown the care plan and records?"),
      ...yn("explainedFile", "Was it explained what they're for?"),
      ...yn("askedQuestions", "Did they ask questions about the company or the people we support?"),
      ...yn("careExperience", "Do they appear to have care experience?"),
      { id: "trainingNeeds", label: "Were any training needs noticed? If so, what?", type: "longtext" },
    ],
  },
  {
    id: "shVerdict",
    title: "The mentor's view",
    fields: [
      ...yn("recommend", "Would the mentor advise us to employ this person?"),
      ...yn("workAgain", "Would the mentor like to work with this person again?"),
      { id: "additional", label: "Anything else we should know", type: "longtext" },
    ],
  },
];

export function validateShadowing(answers: Answers, todayIso: string): Record<string, FieldError[]> {
  const out: Record<string, FieldError[]> = {};
  for (const s of SHADOWING_SECTIONS) {
    // "visitsCount" is a count of people, checked here rather than as hours.
    const errors = validateSection(s, answers, todayIso).filter((e) => e.field !== "visitsCount");
    const n = Number(answers.visitsCount);
    if (s.id === "shDay" && !(Number.isInteger(n) && n >= 0 && n <= 40)) errors.push({ field: "visitsCount", message: "Enter how many people they visited (0 or more)." });
    // A "no" on these needs a reason: it may cost someone a job.
    for (const id of ["recommend", "workAgain", "standard", "respectful"]) {
      if (s.fields.some((f) => f.id === id) && answers[id] === "no" && !String(answers[`${id}Comment`] ?? "").trim()) {
        errors.push({ field: `${id}Comment`, message: "Please say why." });
      }
    }
    if (errors.length) out[s.id] = errors;
  }
  return out;
}

export const sanitiseShadowing = (raw: unknown): Answers => sanitiseWith(SHADOWING_SECTIONS, raw);

/** What the office reads first. */
export function shadowingFlags(answers: Answers): string[] {
  const flags: string[] = [];
  if (answers.recommend === "no") flags.push("The mentor would NOT advise employing them");
  if (answers.workAgain === "no") flags.push("The mentor wouldn't like to work with them again");
  for (const [id, text] of [
    ["respectful", "Not polite and respectful to the people visited"],
    ["standard", "Tasks not carried out to a satisfactory standard"],
    ["onTime", "Didn't arrive at the right time"],
    ["communicated", "Didn't communicate clearly"],
    ["equipment", "Didn't seem capable with equipment"],
  ] as const) {
    if (answers[id] === "no") flags.push(text);
  }
  if (String(answers.trainingNeeds ?? "").trim()) flags.push("Training needs noted");
  return flags;
}

/** The note on the Shadowing step once the record is finished. */
export function shadowingNote(answers: Answers): string {
  const who = String(answers.mentorName ?? "").trim();
  const verdict = answers.recommend === "yes" ? "recommended" : "NOT recommended";
  const flags = shadowingFlags(answers).length;
  return `Mentor ${who || "unnamed"}: ${verdict}${flags ? ` · ${flags} thing${flags === 1 ? "" : "s"} to read` : ""}`;
}

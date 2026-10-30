import type { FormSection } from "@/lib/recruitment-application";

/**
 * Leavers (HR-PACK.md, agreed 29 Oct 2026): the leaving reason, notice date,
 * last working day and whether they could be re-employed; the leaver
 * checklist; their login switched off after their last day; an optional exit
 * interview; their training record emailed to them; and references given to
 * new employers, factual and produced from the file.
 *
 * Pure: the leaver's page, the list and the daily job read from here.
 */

export const LEAVING_REASONS = [
  { value: "resigned", label: "Resigned" },
  { value: "dismissed", label: "Dismissed" },
  { value: "end_of_probation", label: "Did not pass probation" },
  { value: "retired", label: "Retired" },
  { value: "end_of_contract", label: "End of a fixed-term contract" },
  { value: "redundancy", label: "Redundancy" },
  { value: "other", label: "Other" },
] as const;

export const reasonLabel = (v: string | null | undefined) => LEAVING_REASONS.find((r) => r.value === v)?.label ?? "—";

export const RE_EMPLOYABLE = [
  { value: "yes", label: "Yes" },
  { value: "with_conditions", label: "Yes, with conditions" },
  { value: "no", label: "No" },
] as const;

export const CHECKLIST = [
  { key: "badge", label: "ID badge returned" },
  { key: "uniform", label: "Uniform returned" },
  { key: "keys", label: "Keys returned" },
  { key: "equipment", label: "Equipment returned (phone, PPE, laptop)" },
  {
    key: "key_safes",
    label: "Key safe codes changed",
    hint: "At the homes of every client they visited. Note which, so nobody is missed.",
  },
  { key: "final_pay", label: "Final pay notified to payroll", hint: "Including holiday owed or overtaken." },
] as const;

export type ChecklistItem = { done: boolean; on?: string | null; note?: string | null };
export type Checklist = Record<string, ChecklistItem>;

export function sanitiseChecklist(raw: unknown): Checklist {
  const out: Checklist = {};
  if (!raw || typeof raw !== "object") return out;
  for (const item of CHECKLIST) {
    const v = (raw as Record<string, unknown>)[item.key];
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    out[item.key] = {
      done: r.done === true,
      on: typeof r.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.on) ? r.on : null,
      note: typeof r.note === "string" ? r.note.replace(/\r/g, "").trim().slice(0, 2000) || null : null,
    };
  }
  return out;
}

export const checklistDone = (c: Checklist) => CHECKLIST.filter((i) => c[i.key]?.done).length;

/** Their login goes off the day after their last working day. */
export const loginDueOff = (lastDay: string, todayIso: string) => lastDay < todayIso;

/** The DBS barring referral question (HR-PACK.md, Legal reminders). */
export const asksAboutDbs = (reason: string) => reason === "dismissed" || reason === "resigned" || reason === "end_of_probation";

export const EXIT_SECTIONS: FormSection[] = [
  {
    id: "exWhy",
    title: "Why you're leaving",
    fields: [
      {
        id: "mainReason",
        label: "The main reason",
        type: "select",
        options: ["A new job in care", "A job outside care", "Pay", "Hours or rota", "Travel or driving", "How I was managed", "Training or support", "Family or health", "Moving away", "Retiring", "Other"],
        required: true,
      },
      { id: "reasonMore", label: "Tell us more, if you'd like", type: "longtext" },
    ],
  },
  {
    id: "exWork",
    title: "Working here",
    fields: [
      { id: "liked", label: "What did you like about working here?", type: "longtext" },
      { id: "improve", label: "What could we do better?", type: "longtext" },
      { id: "supported", label: "Did you feel supported by the office and your manager?", type: "select", options: ["Always", "Mostly", "Sometimes", "Rarely"], required: true },
      { id: "training", label: "Was your training enough to do the job well?", type: "yesno", required: true },
      { id: "recommend", label: "Would you recommend us to a friend looking for care work?", type: "yesno", required: true },
      { id: "comeBack", label: "Would you consider coming back?", type: "yesno" },
      { id: "anythingElse", label: "Anything else you'd like to tell us?", type: "longtext" },
    ],
  },
];

/**
 * A factual reference from the file (HR-PACK.md): the dates, the role and the
 * reason for leaving. Nothing else is said unless the manager adds it: a
 * reference must be true, accurate and fair, and a factual one is the safe
 * default.
 */
export function factualReference(v: {
  fullName: string;
  companyName: string;
  jobTitle: string;
  startDate: string | null;
  lastDay: string;
  reason: string;
  requesterName: string;
}): string {
  const start = v.startDate ? ` from ${v.startDate}` : "";
  return [
    `Thank you for your request for a reference for ${v.fullName}.`,
    `I can confirm that ${v.fullName} was employed by ${v.companyName || "us"} as ${v.jobTitle}${start} until ${v.lastDay}.`,
    `Their reason for leaving: ${reasonLabel(v.reason).toLowerCase()}.`,
    `It is our policy to give factual references. This reference is given in confidence for the purpose you requested it and is accurate to the best of our knowledge.`,
  ].join("\n\n");
}

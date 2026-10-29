import type { FormField, FormSection } from "@/lib/recruitment-application";

/**
 * A company's own questions (RECRUITMENT.md, release 7): added to the
 * application form, the interview record and the reference form, after ours.
 * Our questions stay as they are: the application's checks (work history,
 * gaps, referees) and the offer letter's evidence depend on them.
 *
 * A question that's taken out is retired, not deleted, so answers already
 * given to it still show on the record. Pure.
 */

export type CustomForm = "application" | "interview" | "reference";
export const CUSTOM_FORMS: CustomForm[] = ["application", "interview", "reference"];
export const CUSTOM_FORM_LABELS: Record<CustomForm, string> = {
  application: "Application form",
  interview: "Interview record",
  reference: "Reference form",
};

export type CustomType = "text" | "longtext" | "yesno" | "select";
export const CUSTOM_TYPES: Array<{ type: CustomType; label: string }> = [
  { type: "longtext", label: "A written answer" },
  { type: "text", label: "A short answer" },
  { type: "yesno", label: "Yes or no" },
  { type: "select", label: "Pick one from a list" },
];

export interface CustomQuestion {
  id: string;
  label: string;
  type: CustomType;
  options?: string[];
  required: boolean;
  help?: string;
  retired?: boolean;
}

export type CustomQuestions = Record<CustomForm, CustomQuestion[]>;
export const MAX_CUSTOM = 20;
const ID = /^cq_[a-z0-9]{6,12}$/;

const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function sanitiseCustomQuestions(raw: unknown): CustomQuestions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { application: [], interview: [], reference: [] } as CustomQuestions;
  for (const form of CUSTOM_FORMS) {
    const list = Array.isArray(r[form]) ? (r[form] as unknown[]) : [];
    const seen = new Set<string>();
    for (const item of list) {
      const q = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const id = typeof q.id === "string" && ID.test(q.id) ? q.id : null;
      const type = CUSTOM_TYPES.some((t) => t.type === q.type) ? (q.type as CustomType) : null;
      const label = line(q.label, 300);
      if (!id || !type || !label || seen.has(id)) continue;
      const options = type === "select" ? (Array.isArray(q.options) ? q.options : []).map((o) => line(o, 100)).filter(Boolean).slice(0, 20) : undefined;
      if (type === "select" && (!options || options.length < 2)) continue;
      seen.add(id);
      out[form].push({ id, label, type, options, required: q.required === true, help: line(q.help, 300) || undefined, retired: q.retired === true || undefined });
    }
    // Only the live ones count towards the limit; retired ones stay to show old answers.
    let live = 0;
    out[form] = out[form].filter((q) => q.retired || ++live <= MAX_CUSTOM);
  }
  return out;
}

export const newQuestionId = () => `cq_${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;

const asField = (q: CustomQuestion): FormField => ({
  id: q.id,
  label: q.label,
  type: q.type,
  options: q.options,
  required: q.retired ? false : q.required,
  help: q.help,
});

/**
 * The company's questions as a form section. For filling in: the live ones.
 * For reading a record: retired ones too, so earlier answers still show.
 */
export function customSection(
  questions: CustomQuestion[],
  opts: { title: string; intro?: string; forRecord?: boolean; answered?: Record<string, unknown> | null },
): FormSection | null {
  // A retired question stays on a record that already answers it, so saving the record again keeps the answer.
  const has = (id: string) => opts.answered?.[id] !== undefined && opts.answered?.[id] !== "";
  const fields = questions.filter((q) => opts.forRecord || !q.retired || has(q.id)).map(asField);
  return fields.length ? { id: "company", title: opts.title, intro: opts.intro, fields } : null;
}

/** Our sections with the company's put in before the one named (or at the end). */
export function withCustom(sections: FormSection[], custom: FormSection | null, beforeId?: string): FormSection[] {
  if (!custom) return sections;
  const at = beforeId ? sections.findIndex((s) => s.id === beforeId) : -1;
  return at < 0 ? [...sections, custom] : [...sections.slice(0, at), custom, ...sections.slice(at)];
}

// ─── Each form, with the company's questions ────────────────────────────────

export const APPLICATION_CUSTOM_TITLE = "A few more questions";
export const INTERVIEW_CUSTOM_TITLE = "Your company's questions";
export const REFERENCE_CUSTOM_TITLE = "A few more questions";

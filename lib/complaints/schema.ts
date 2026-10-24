/**
 * The question engine behind a complaint's stage forms.
 *
 * lib/forms.ts is the forms LIBRARY: fields a manager builds in the editor and
 * stores in the database. These forms are the opposite — they are the process,
 * so they live in code (lib/complaints/forms.ts) and change by deploy. A
 * question nobody can delete is the point: a Findings stage without "does the
 * duty of candour apply" is not a shorter form, it is a missing obligation.
 *
 * One rule matters here and is defined once: a question with a `showWhen` is
 * not asked unless its condition holds, and a hidden question is neither
 * required, nor counted, nor printed. The renderer, the done/not-done test and
 * the PDF all read visibility from here, so none of them can disagree about
 * whether an unanswered question was ever asked.
 *
 * Pure: no I/O, no React.
 */

export type QuestionType =
  | "text"
  | "long_text"
  | "date"
  | "select"
  | "multiselect"
  | "yes_no";

export interface QuestionOption {
  value: string;
  label: string;
}

/** Show this question only when another's answer matches. */
export interface ShowWhen {
  questionId: string;
  equals: string | boolean;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: QuestionOption[];
  /** Options filled in at render time from the organisation's own people. */
  optionsSource?: "staff";
  required?: boolean;
  help?: string;
  showWhen?: ShowWhen;
}

export interface FormSection {
  id: string;
  title: string;
  order: number;
  description?: string;
  questions: Question[];
}

export interface StageForm {
  sections: FormSection[];
}

export type AnswerValue = string | boolean | string[] | null | undefined;
export type AnswerMap = Record<string, AnswerValue>;

/**
 * "Yes"/"No" are stored as booleans by the renderer, but answers saved by an
 * older build — or typed into a condition — may be either. Compare on one
 * normalised form so a condition cannot quietly stop matching.
 */
function normalise(value: AnswerValue | string | boolean): string | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "Yes") return true;
    if (value === "No") return false;
    return value;
  }
  return undefined; // arrays are never used in a condition
}

/** A question is visible unless its condition says otherwise. */
export function isVisible(question: Question, answers: AnswerMap): boolean {
  if (!question.showWhen) return true;
  return normalise(answers[question.showWhen.questionId]) === normalise(question.showWhen.equals);
}

/** Whether an answer counts as given. `false` is an answer to a yes/no. */
export function hasAnswer(value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** The questions of a section that are actually being asked. */
export function visibleQuestions(section: FormSection, answers: AnswerMap): Question[] {
  return section.questions.filter((q) => isVisible(q, answers));
}

/** Every question being asked, across the form, in order. */
export function visibleForm(form: StageForm, answers: AnswerMap): Question[] {
  return [...form.sections]
    .sort((a, b) => a.order - b.order)
    .flatMap((s) => visibleQuestions(s, answers));
}

/** Fill in the options for questions that take them from the org's people. */
export function withPeopleOptions(form: StageForm, staff: QuestionOption[]): StageForm {
  return {
    sections: form.sections.map((s) => ({
      ...s,
      questions: s.questions.map((q) =>
        q.optionsSource === "staff" ? { ...q, options: staff } : q,
      ),
    })),
  };
}

const ukDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : iso;

/** One answer as a line of text, for a document or a summary. */
export function formatAnswer(question: Question, value: AnswerValue): string {
  if (!hasAnswer(value)) return "";
  if (question.type === "yes_no") return value === true || value === "Yes" ? "Yes" : "No";
  if (question.type === "date") return ukDate(String(value));
  const label = (v: string) =>
    question.options?.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(label).join(", ");
  return question.type === "select" ? label(String(value)) : String(value);
}

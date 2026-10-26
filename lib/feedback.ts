/**
 * Client and carer feedback (ROADMAP §4): survey links sent to families,
 * service users and staff, with results trended. Nothing in the platform
 * captured what people say about a provider, and inspectors ask.
 *
 * Two surveys, as code like the audit templates: one for the people who
 * receive care and their families, one for staff. Ratings are 1–5; the open
 * questions are optional. Pure, no I/O.
 */

export interface SurveyQuestion {
  id: string;
  text: string;
  type: "rating" | "text";
}

export interface SurveyKind {
  key: "client" | "staff";
  label: string;
  /** Who it is for, said on the link's page. */
  audience: string;
  questions: SurveyQuestion[];
}

export const SURVEY_KINDS: SurveyKind[] = [
  {
    key: "client",
    label: "Client and family feedback",
    audience: "people who receive care from us, and their families",
    questions: [
      { id: "overall", text: "Overall, how satisfied are you with the care you receive?", type: "rating" },
      { id: "respect", text: "Do the carers treat you with dignity and respect?", type: "rating" },
      { id: "on_time", text: "Do the carers arrive on time, or let you know if they are late?", type: "rating" },
      { id: "listened", text: "Do you feel listened to about how your care is given?", type: "rating" },
      { id: "safe", text: "Do you feel safe with the carers who visit you?", type: "rating" },
      { id: "contact", text: "When you contact the office, is it easy to get help?", type: "rating" },
      { id: "good", text: "What do we do well?", type: "text" },
      { id: "better", text: "What could we do better?", type: "text" },
    ],
  },
  {
    key: "staff",
    label: "Carer and staff feedback",
    audience: "the people who work for us",
    questions: [
      { id: "overall", text: "Overall, how satisfied are you working here?", type: "rating" },
      { id: "supported", text: "Do you feel supported by your manager?", type: "rating" },
      { id: "training", text: "Do you have the training you need to do your job well?", type: "rating" },
      { id: "rota", text: "Is your rota workable, with enough time between visits?", type: "rating" },
      { id: "raise", text: "Do you feel able to raise a concern without worrying about the consequences?", type: "rating" },
      { id: "recommend", text: "Would you recommend us as a place to work?", type: "rating" },
      { id: "good", text: "What is good about working here?", type: "text" },
      { id: "better", text: "What would make it better?", type: "text" },
    ],
  },
];

export function surveyKind(key: string): SurveyKind | undefined {
  return SURVEY_KINDS.find((k) => k.key === key);
}

/** Keep only answers to this survey's questions, in range. Null if no rating was given at all. */
export function cleanSurveyAnswers(kind: SurveyKind, raw: Record<string, unknown>): Record<string, number | string> | null {
  const out: Record<string, number | string> = {};
  for (const q of kind.questions) {
    const v = raw[q.id];
    if (q.type === "rating") {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 5) out[q.id] = n;
    } else if (typeof v === "string" && v.trim()) {
      out[q.id] = v.trim().slice(0, 2000);
    }
  }
  return kind.questions.some((q) => q.type === "rating" && q.id in out) ? out : null;
}

export interface SurveyResponseRow {
  submitted_at: string;
  answers: Record<string, number | string>;
}

/** The average rating per question, to one decimal, with how many answered it. */
export function averages(kind: SurveyKind, rows: SurveyResponseRow[]): { id: string; text: string; average: number | null; count: number }[] {
  return kind.questions
    .filter((q) => q.type === "rating")
    .map((q) => {
      const values = rows.map((r) => r.answers[q.id]).filter((v): v is number => typeof v === "number");
      const average = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
      return { id: q.id, text: q.text, average, count: values.length };
    });
}

/** The overall rating month by month, oldest first, for the trend. */
export function monthlyTrend(rows: SurveyResponseRow[], questionId = "overall"): { month: string; average: number; count: number }[] {
  const byMonth = new Map<string, number[]>();
  for (const r of rows) {
    const v = r.answers[questionId];
    if (typeof v !== "number") continue;
    const month = r.submitted_at.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), v]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vs]) => ({ month, average: Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10, count: vs.length }));
}

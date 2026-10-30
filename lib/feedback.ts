/**
 * Client and carer feedback (ROADMAP §4): survey links sent to families,
 * service users and staff, with results trended. Nothing in the platform
 * captured what people say about a provider, and inspectors ask.
 *
 * Two surveys, as code like the audit templates: one for the people who
 * receive care and their families, one for staff. Ratings are 1–5; the open
 * questions are optional. Pure, no I/O.
 *
 * Since FORMS.md (29 Oct 2026) the wording here is only the starting point:
 * a company words its own surveys, and each round keeps the questions it was
 * sent with (questionsForRound). A round is anonymous, or — for a client
 * survey — named, each answer linked to the client so the office can act on
 * it: a low score raised as a concern, praise logged as a compliment.
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
export function cleanSurveyAnswers(kind: { questions: SurveyQuestion[] }, raw: Record<string, unknown>): Record<string, number | string> | null {
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
export function averages(kind: { questions: SurveyQuestion[] }, rows: SurveyResponseRow[]): { id: string; text: string; average: number | null; count: number }[] {
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

// ---------------------------------------------------------------------------
// Rounds and wording (FORMS.md, "Feedback surveys")
// ---------------------------------------------------------------------------

export const MAX_QUESTIONS = 20;

/**
 * A company's wording, made safe to keep: up to twenty questions, each with
 * text and a known type, ids kept where they are given (so a renamed
 * question still lines up with earlier answers) and made where not. At least
 * one rating, or a survey could never be answered. Null when nothing usable
 * was given.
 */
export function cleanQuestions(raw: unknown): SurveyQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: SurveyQuestion[] = [];
  for (const r of raw.slice(0, MAX_QUESTIONS)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim().slice(0, 300) : "";
    if (!text) continue;
    const type = o.type === "text" ? "text" : "rating";
    let id = typeof o.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(o.id) ? o.id : `q${out.length + 1}`;
    while (seen.has(id)) id = `${id}_${out.length + 1}`;
    seen.add(id);
    out.push({ id, text, type });
  }
  return out.some((q) => q.type === "rating") ? out : null;
}

/** The questions a round was sent with; a round from before kept the original wording. */
export function questionsForRound(round: { kind: string; questions?: unknown }): SurveyQuestion[] {
  const own = round.questions ? cleanQuestions(round.questions) : null;
  return own ?? surveyKind(round.kind)?.questions ?? [];
}

/** The question a round's trend follows: "overall" where there is one, or the first rating. */
export function headlineQuestion(questions: SurveyQuestion[]): SurveyQuestion | undefined {
  return questions.find((q) => q.id === "overall" && q.type === "rating") ?? questions.find((q) => q.type === "rating");
}

/** A score this low is worth raising: any rating of 1 or 2. */
export const LOW_SCORE = 2;

export function isLowScore(questions: SurveyQuestion[], answers: Record<string, number | string>): boolean {
  return questions.some((q) => q.type === "rating" && typeof answers[q.id] === "number" && (answers[q.id] as number) <= LOW_SCORE);
}

/** Praise worth logging: every rating 4 or 5, and something said in words. */
export function isPraise(questions: SurveyQuestion[], answers: Record<string, number | string>): boolean {
  const ratings = questions.filter((q) => q.type === "rating" && typeof answers[q.id] === "number");
  const words = questions.some((q) => q.type === "text" && typeof answers[q.id] === "string" && (answers[q.id] as string).trim());
  return ratings.length > 0 && ratings.every((q) => (answers[q.id] as number) >= 4) && words;
}

/** An answer as plain lines — for a concern raised from it, or a compliment. */
export function answerLines(questions: SurveyQuestion[], answers: Record<string, number | string>, { textOnly = false } = {}): string[] {
  const label = ["", "very poor", "poor", "OK", "good", "very good"];
  return questions
    .filter((q) => answers[q.id] !== undefined && (!textOnly || q.type === "text"))
    .map((q) => (q.type === "rating" ? `${q.text} ${answers[q.id]}/5 (${label[answers[q.id] as number] ?? ""})` : `${q.text} “${answers[q.id]}”`));
}

/**
 * How many answered, out of how many were asked: everyone sent their own
 * link, plus however many the office says were handed the open link or QR
 * code. Null when nobody has been counted, so no rate is made up.
 */
export function responseRate({
  invited,
  sentTo,
  responses,
}: {
  invited: number;
  sentTo: number | null;
  responses: number;
}): { asked: number; answered: number; percent: number } | null {
  const asked = invited + (sentTo ?? 0);
  if (asked === 0) return null;
  return { asked, answered: responses, percent: Math.min(100, Math.round((responses / asked) * 100)) };
}

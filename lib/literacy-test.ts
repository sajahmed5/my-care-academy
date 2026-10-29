/**
 * Brought across from MyRoster (src/lib/recruitment/literacyTest.ts) on
 * 29 Oct 2026 unchanged: the same test for every company by default.
 *
 * The literacy assessment — questions, ANSWERS and marking.
 *
 * ⚠ SERVER ONLY. This file holds the answer key. The candidate's page never
 * imports it: it renders what /api/recruit/literacy sends, which is
 * `publicQuestions()` — the questions with every answer stripped. A test
 * (tests/literacy-test.test.ts) fails if any "use client" file imports this module.
 *
 * Rewritten from HG Care's paper PR33 (2016) at Saj's request, 21 Sept 2026:
 * still basic, but every question is something a carer actually reads or
 * writes — a care plan, a visit note, a medicine label, a rota — and answered
 * by tapping rather than writing on lines. 20 marks, 20 minutes, 80% to pass,
 * exactly as the paper test. "Is English your first language?" is gone: it
 * was never marked, and asking it invites a discrimination claim.
 *
 * Everything is auto-marked, so every question has one defensible answer.
 * Spelling is the only typed answer (autocorrect is switched off on that box).
 */

export const LITERACY_VERSION = 1;
export const LITERACY_MINUTES = 20;
export const LITERACY_PASS_PERCENT = 80;
/** Answers arriving this long after the deadline are still taken (slow phones, bad signal). */
export const LITERACY_GRACE_SECONDS = 15;

interface Base { id: string; marks: number; prompt: string; passage?: { title: string; text: string } }
/** Tap one answer. */
interface Choice extends Base { type: "choice"; options: string[]; answer: string }
/** Tap the words that are spelt wrongly in a sentence. One mark per word found; a wrong tap costs one. */
interface TapWords extends Base { type: "tapWords"; text: string; wrong: string[] }
/** Type the correct spelling of each word shown. One mark each. */
interface Spell extends Base { type: "spell"; words: Array<{ shown: string; accept: string[] }> }
/** Tap the tiles into the right order. All or nothing. */
interface Order extends Base { type: "order"; tiles: string[]; answer: string[]; joinWith?: string }

export type LiteracyQuestion = Choice | TapWords | Spell | Order;

const CARE_PLAN = {
  title: "From a care plan",
  text: "Mrs Khan likes her tea with milk and no sugar. Mr Jones has his coffee black with two sugars. Miss Patel drinks only water. Mr Jones must not have grapefruit because of his tablets.",
};
const LABEL = {
  title: "A medicine label",
  text: "PARACETAMOL 500mg TABLETS\nTake ONE or TWO tablets up to FOUR times a day.\nLeave at least 4 hours between doses.\nDo not take more than 8 tablets in 24 hours.\nDo not take with other medicines that contain paracetamol.",
};

export const LITERACY_QUESTIONS: LiteracyQuestion[] = [
  { id: "q1", type: "choice", marks: 1, passage: CARE_PLAN, prompt: "Who has two sugars in their drink?", options: ["Mrs Khan", "Mr Jones", "Miss Patel", "Nobody"], answer: "Mr Jones" },
  { id: "q2", type: "choice", marks: 1, passage: CARE_PLAN, prompt: "Who has milk in their drink?", options: ["Mrs Khan", "Mr Jones", "Mrs Khan and Mr Jones", "Miss Patel"], answer: "Mrs Khan" },
  { id: "q3", type: "choice", marks: 1, passage: CARE_PLAN, prompt: "Mr Jones asks you for a glass of grapefruit juice. What does the care plan tell you?", options: ["He can have it with two sugars", "He must not have it, because of his tablets", "He can only have it with water", "It does not say anything about it"], answer: "He must not have it, because of his tablets" },

  { id: "q4", type: "tapWords", marks: 2, prompt: "A carer wrote this visit note. Tap the TWO words that are spelt wrongly.", text: "Mrs Smith ate all the brekfast and had a cup of tea. She said that her left knee was painfull today.", wrong: ["brekfast", "painfull"] },
  { id: "q5", type: "spell", marks: 2, prompt: "Now type each word with the correct spelling.", words: [{ shown: "brekfast", accept: ["breakfast"] }, { shown: "painfull", accept: ["painful"] }] },

  { id: "q6", type: "order", marks: 2, prompt: "Tap the words in order to make a sentence for a visit note.", tiles: ["her", "Mrs Lee", "tablets.", "has", "morning", "taken"], answer: ["Mrs Lee", "has", "taken", "her", "morning", "tablets."], joinWith: " " },
  // Plain sequencing anyone can do from the words alone — NOT the order of gloves and hand-washing, which is training they have not had yet (Saj, 21 Sept 2026: "something a 10 year old can finish").
  { id: "q7", type: "order", marks: 2, prompt: "You are visiting Mr Brown to help with his lunch. Tap these steps into the right order.", tiles: ["Help Mr Brown to eat his lunch", "Write your visit note and say goodbye", "Knock on the door and wait", "Say hello and ask Mr Brown how he is"], answer: ["Knock on the door and wait", "Say hello and ask Mr Brown how he is", "Help Mr Brown to eat his lunch", "Write your visit note and say goodbye"] },

  { id: "q8", type: "choice", marks: 1, passage: LABEL, prompt: "What is the most tablets that can be taken in 24 hours?", options: ["2", "4", "8", "16"], answer: "8" },
  { id: "q9", type: "choice", marks: 1, passage: LABEL, prompt: "Mrs Green took two tablets at 8 o'clock in the morning. What is the earliest she can have more?", options: ["9 o'clock in the morning", "10 o'clock in the morning", "12 o'clock midday", "8 o'clock in the evening"], answer: "12 o'clock midday" },
  { id: "q10", type: "choice", marks: 1, passage: LABEL, prompt: "Why does the label give a most-you-can-take in 24 hours?", options: ["More tablets would cost too much", "It can be dangerous to take more", "The tablets stop working after 8", "So the box lasts longer"], answer: "It can be dangerous to take more" },

  { id: "q11", type: "order", marks: 2, prompt: "These medicines need putting away in alphabetical order (A to Z). Tap them in order.", tiles: ["Metformin", "Aspirin", "Paracetamol", "Amlodipine", "Ibuprofen"], answer: ["Amlodipine", "Aspirin", "Ibuprofen", "Metformin", "Paracetamol"] },

  { id: "q12", type: "choice", marks: 1, prompt: "Choose the word that makes this sentence correct:  “I ___ late for my visit last Thursday.”", options: ["is", "was", "am", "were"], answer: "was" },
  { id: "q13", type: "choice", marks: 1, prompt: "Which of these is written correctly?", options: ["mrs jones lives in stockport.", "Mrs Jones lives in Stockport.", "Mrs jones lives in stockport", "mrs Jones Lives In Stockport."], answer: "Mrs Jones lives in Stockport." },

  { id: "q14", type: "choice", marks: 1, prompt: "Your rota says: “Mr Shah — 08:30 — 45 minutes”. What time does the visit finish?", options: ["08:45", "09:00", "09:15", "09:30"], answer: "09:15" },
  { id: "q15", type: "choice", marks: 1, prompt: "Which is the BEST note to write after a lunch visit?", options: ["She was fine.", "Did everything.", "Mrs Khan ate half her lunch, drank a full glass of water and said she felt tired.", "ok"], answer: "Mrs Khan ate half her lunch, drank a full glass of water and said she felt tired." },
];

export const LITERACY_MAX = LITERACY_QUESTIONS.reduce((n, q) => n + q.marks, 0);

// ─── A company's own test (release 7) ───────────────────────────────────────

/** The test an attempt is taken and marked on: frozen onto it when it's unlocked. */
export interface LiteracyTest { questions: LiteracyQuestion[]; minutes: number; passPercent: number }
export const DEFAULT_TEST: LiteracyTest = { questions: LITERACY_QUESTIONS, minutes: LITERACY_MINUTES, passPercent: LITERACY_PASS_PERCENT };

/** A company's own question: tap one answer, one mark (so marking stays automatic). */
export interface OwnQuestion { id: string; prompt: string; options: string[]; answer: string }
/** What a company sets: the time, the pass mark, which of our questions it leaves out, and its own. */
export interface LiteracySettings { minutes: number; passPercent: number; off: string[]; own: OwnQuestion[] }
export const DEFAULT_LITERACY_SETTINGS: LiteracySettings = { minutes: LITERACY_MINUTES, passPercent: LITERACY_PASS_PERCENT, off: [], own: [] };
export const MIN_MARKS = 8;

const lineOf = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function sanitiseLiteracySettings(raw: unknown): LiteracySettings {
  if (!raw || typeof raw !== "object") return DEFAULT_LITERACY_SETTINGS;
  const r = raw as Record<string, unknown>;
  const minutes = Math.round(Number(r.minutes));
  const pass = Math.round(Number(r.passPercent));
  const ours = new Set(LITERACY_QUESTIONS.map((q) => q.id));
  const own: OwnQuestion[] = [];
  for (const item of Array.isArray(r.own) ? r.own.slice(0, 20) : []) {
    const q = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const id = typeof q.id === "string" && /^own_[a-z0-9]{6,12}$/.test(q.id) ? q.id : null;
    const options = [...new Set((Array.isArray(q.options) ? q.options : []).map((o) => lineOf(o, 200)).filter(Boolean))].slice(0, 6);
    const answer = lineOf(q.answer, 200);
    const prompt = lineOf(q.prompt, 400);
    if (id && prompt && options.length >= 2 && options.includes(answer)) own.push({ id, prompt, options, answer });
  }
  return {
    minutes: minutes >= 5 && minutes <= 60 ? minutes : LITERACY_MINUTES,
    passPercent: pass >= 30 && pass <= 100 ? pass : LITERACY_PASS_PERCENT,
    off: (Array.isArray(r.off) ? r.off : []).filter((x): x is string => typeof x === "string" && ours.has(x)),
    own,
  };
}

/** The test a company's settings make. */
export function testFor(settings: LiteracySettings): LiteracyTest {
  const questions: LiteracyQuestion[] = [
    ...LITERACY_QUESTIONS.filter((q) => !settings.off.includes(q.id)),
    ...settings.own.map((q): LiteracyQuestion => ({ id: q.id, type: "choice", marks: 1, prompt: q.prompt, options: q.options, answer: q.answer })),
  ];
  return { questions, minutes: settings.minutes, passPercent: settings.passPercent };
}

export const maxMarks = (test: LiteracyTest) => test.questions.reduce((n, q) => n + q.marks, 0);

/** What stops a company's test being used: too few marks to mean anything. */
export function literacySettingsProblems(settings: LiteracySettings): string[] {
  const marks = maxMarks(testFor(settings));
  return marks < MIN_MARKS ? [`The test needs at least ${MIN_MARKS} marks; it has ${marks}. Switch some of ours back on, or add your own.`] : [];
}

/** An attempt's frozen test, or ours for an attempt made before companies had their own. */
export function testOf(stored: unknown): LiteracyTest {
  const t = stored as LiteracyTest | null | undefined;
  return t && Array.isArray(t.questions) && t.questions.length && Number(t.minutes) > 0 && Number(t.passPercent) > 0 ? t : DEFAULT_TEST;
}

/** What the candidate's browser is sent: the questions, and nothing that answers them. */
export function publicQuestions(test: LiteracyTest = DEFAULT_TEST) {
  return test.questions.map((q) => {
    const base = { id: q.id, type: q.type, marks: q.marks, prompt: q.prompt, passage: q.passage ?? null };
    if (q.type === "choice") return { ...base, options: q.options };
    // Each token carries the bare word to send back, so the page and the
    // marker can never disagree about punctuation.
    if (q.type === "tapWords") return { ...base, tokens: q.text.split(/\s+/).map((t) => ({ show: t, word: bare(t) })), pick: q.wrong.length };
    if (q.type === "spell") return { ...base, words: q.words.map((w) => w.shown) };
    return { ...base, tiles: q.tiles, joinWith: q.joinWith ?? null };
  });
}

export type LiteracyAnswers = Record<string, string | string[] | undefined>;

const tidy = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const bare = (token: string) => token.replace(/[.,!?;:"“”]/g, "");
const words = (text: string) => text.split(/\s+/).map(bare).filter(Boolean);

/** Only shapes the test expects, capped — the browser's answers are never trusted as-is. */
export function sanitiseLiteracyAnswers(raw: unknown, test: LiteracyTest = DEFAULT_TEST): LiteracyAnswers {
  const out: LiteracyAnswers = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const q of test.questions) {
    const v = src[q.id];
    if (q.type === "choice") { if (typeof v === "string" && q.options.includes(v)) out[q.id] = v; continue; }
    if (!Array.isArray(v)) continue;
    const list = v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80));
    if (q.type === "tapWords") { const allowed = new Set(words(q.text)); out[q.id] = [...new Set(list.filter((w) => allowed.has(w)))].slice(0, 12); continue; }
    if (q.type === "spell") { out[q.id] = list.slice(0, q.words.length); continue; }
    if (q.type === "order") { const allowed = new Set(q.tiles); out[q.id] = [...new Set(list.filter((t) => allowed.has(t)))]; }
  }
  return out;
}

export interface MarkedQuestion { id: string; prompt: string; marks: number; awarded: number; given: string; correct: string }
export interface LiteracyResult { score: number; max: number; percent: number; passed: boolean; questions: MarkedQuestion[] }

export function markLiteracy(answers: LiteracyAnswers, test: LiteracyTest = DEFAULT_TEST): LiteracyResult {
  const questions: MarkedQuestion[] = test.questions.map((q) => {
    const a = answers[q.id];
    let awarded = 0, given = "—", correct = "";
    if (q.type === "choice") {
      correct = q.answer; given = typeof a === "string" ? a : "—";
      awarded = a === q.answer ? q.marks : 0;
    } else if (q.type === "tapWords") {
      const picked = Array.isArray(a) ? a : [];
      correct = q.wrong.join(", "); given = picked.join(", ") || "—";
      // One mark per wrong word found; a correctly-spelt word tapped costs one
      // — so tapping every word in the sentence scores nothing.
      const hits = picked.filter((w) => q.wrong.includes(w)).length;
      const misses = picked.filter((w) => !q.wrong.includes(w)).length;
      awarded = Math.max(0, Math.min(q.marks, hits - misses));
    } else if (q.type === "spell") {
      const typed = Array.isArray(a) ? a : [];
      correct = q.words.map((w) => w.accept[0]).join(", "); given = q.words.map((_, i) => typed[i]?.trim() || "—").join(", ");
      awarded = q.words.filter((w, i) => w.accept.includes(tidy(typed[i]))).length;
    } else {
      const order = Array.isArray(a) ? a : [];
      const sep = q.joinWith ?? " → ";
      correct = q.answer.join(sep); given = order.join(sep) || "—";
      awarded = order.length === q.answer.length && order.every((t, i) => t === q.answer[i]) ? q.marks : 0;
    }
    return { id: q.id, prompt: q.prompt, marks: q.marks, awarded, given, correct };
  });
  const score = questions.reduce((n, q) => n + q.awarded, 0);
  const max = maxMarks(test);
  const percent = max ? Math.round((score / max) * 100) : 0;
  return { score, max, percent, passed: percent >= test.passPercent, questions };
}

// ─── Timing ─────────────────────────────────────────────────────────────────
// The clock is the SERVER's. The page shows a countdown, but what counts is
// `deadline_at`, stamped when the candidate pressed Begin.

export interface AttemptTiming { status: string; started_at: string | null; deadline_at: string | null }

export const deadlineFor = (startedAtMs: number, minutes: number = LITERACY_MINUTES) => new Date(startedAtMs + minutes * 60_000).toISOString();

/** Seconds left on a running attempt (0 once over). */
export function secondsLeft(a: AttemptTiming, now: number): number {
  if (a.status !== "in_progress" || !a.deadline_at) return 0;
  return Math.max(0, Math.ceil((new Date(a.deadline_at).getTime() - now) / 1000));
}

/** May answers still be accepted? True until the deadline plus a short grace. */
export function acceptsAnswers(a: AttemptTiming, now: number): boolean {
  if (a.status !== "in_progress" || !a.deadline_at) return false;
  return now <= new Date(a.deadline_at).getTime() + LITERACY_GRACE_SECONDS * 1000;
}

/** Running, but its time (and grace) has gone — to be closed and marked on what was saved. */
export const hasRunOut = (a: AttemptTiming, now: number) => a.status === "in_progress" && !acceptsAnswers(a, now);

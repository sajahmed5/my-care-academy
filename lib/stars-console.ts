import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import { STARS_PER_COURSE } from "@/lib/stars";
import { UK_TIME_ZONE } from "@/lib/dates";

/**
 * Stars in the console (2 Nov 2026): the leaderboard under People → Staff and
 * the Stars tab on a person's file.
 *
 * The learner's own star bank (lib/stars.ts) is a total, recomputed on every
 * page from their attempts. The console needs more than a total — who earned
 * what this quarter, and a dated history — so this module turns the same
 * records into *events*: one per assessment attempt and one per course per
 * day of questions answered along the way, each carrying the stars it banked.
 * Totals, period gains, monthly series and the history are all sums over
 * those events, so the leaderboard can never disagree with a carer's pill.
 *
 * The rules, restated from lib/stars.ts: a star per right answer; a course's
 * assessment is worth its best attempt in the current compliance cycle,
 * capped at 20, so a retake banks only what it adds over that best; a cycle
 * ends when a certificate expires, and the next starts a fresh pool with the
 * old stars kept. An in-content question is worth one star, once, ever.
 *
 * Stars are cosmetic (content_question_stars trusts the H5P signal) and never
 * back a compliance path. This page says so at the foot.
 */

export interface StarAttemptRow {
  user_id: string;
  course_id: string;
  score: number | null;
  passed: boolean | null;
  /** How many questions the attempt served (quiz_attempt_stars.questions). */
  questions: number | null;
  submitted_at: string | null;
}

export interface StarCertificateRow {
  user_id: string;
  course_id: string;
  expires_at: string | null;
}

export interface ContentStarRow {
  user_id: string;
  course_id: string;
  awarded_at: string;
}

export type AssessmentOutcome =
  /** First attempt in this cycle. */
  | "first"
  /** Beat the cycle's previous best: only the difference is banked. */
  | "improved"
  /** First attempt after a certificate expired: a fresh pool, old stars kept. */
  | "renewal"
  /** Did not beat the cycle's best: nothing new. */
  | "no_gain";

export interface StarEvent {
  userId: string;
  courseId: string;
  /** ISO timestamp. */
  at: string;
  kind: "assessment" | "content";
  /** Stars banked by this event (0 for a retake that added nothing). */
  delta: number;
  /** Assessment events. */
  correct?: number;
  questions?: number;
  passed?: boolean;
  bestBefore?: number;
  /** 1-based compliance cycle the attempt fell in. */
  cycle?: number;
  outcome?: AssessmentOutcome;
  /** Content events: questions answered right that day. */
  count?: number;
}

/** Recover the number of right answers from an attempt row. */
export function correctOf(a: { score: number | null; questions: number | null }): number {
  const total = a.questions ?? 0;
  if (total <= 0) return 0;
  return Math.round(((a.score ?? 0) / 100) * total);
}

function ms(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : 0;
}

/** The UK calendar day an instant falls on, as yyyy-mm-dd. */
export function ukDay(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The UK calendar month an instant falls in, as yyyy-mm. */
export function ukMonth(iso: string): string {
  return ukDay(iso).slice(0, 7);
}

/**
 * Every star-bearing moment, oldest first. Pure: the page reads the rows, this
 * works out what each one was worth at the time.
 */
export function starEvents(
  attempts: StarAttemptRow[],
  certificates: StarCertificateRow[],
  content: ContentStarRow[],
): StarEvent[] {
  const key = (u: string, c: string) => `${u}\u0000${c}`;

  // Cycle boundaries per person per course: the expiry of every certificate
  // they have earned for it.
  const bounds = new Map<string, number[]>();
  for (const c of certificates) {
    if (!c.expires_at) continue;
    const k = key(c.user_id, c.course_id);
    const list = bounds.get(k) ?? [];
    list.push(ms(c.expires_at));
    bounds.set(k, list);
  }
  for (const list of bounds.values()) list.sort((a, b) => a - b);

  const events: StarEvent[] = [];

  // Assessments, in the order they were sat, so each one is measured against
  // the best before it in its cycle.
  const sorted = attempts
    .filter((a) => a.submitted_at)
    .slice()
    .sort((a, b) => ms(a.submitted_at) - ms(b.submitted_at));
  const cycleBest = new Map<string, Map<number, number>>();
  for (const a of sorted) {
    const k = key(a.user_id, a.course_id);
    const t = ms(a.submitted_at);
    const b = bounds.get(k) ?? [];
    let idx = 0;
    while (idx < b.length && b[idx] < t) idx++;
    const bests = cycleBest.get(k) ?? new Map<number, number>();
    cycleBest.set(k, bests);
    const bestBefore = bests.get(idx) ?? 0;
    const correct = correctOf(a);
    const worth = Math.min(STARS_PER_COURSE, correct);
    const delta = Math.max(0, worth - bestBefore);
    if (delta > 0) bests.set(idx, worth);
    // A first attempt after a certificate expired (idx > 0) is a renewal.
    const outcome: AssessmentOutcome =
      delta === 0 ? "no_gain" : bestBefore > 0 ? "improved" : idx > 0 ? "renewal" : "first";
    events.push({
      userId: a.user_id,
      courseId: a.course_id,
      at: a.submitted_at!,
      kind: "assessment",
      delta,
      correct,
      questions: a.questions ?? 0,
      passed: !!a.passed,
      bestBefore,
      cycle: idx + 1,
      outcome,
    });
  }

  // Questions along the way: one event per person, course and UK day.
  const days = new Map<string, { userId: string; courseId: string; day: string; first: string; count: number }>();
  for (const r of content) {
    const day = ukDay(r.awarded_at);
    const k = `${key(r.user_id, r.course_id)}\u0000${day}`;
    const cur = days.get(k);
    if (cur) {
      cur.count++;
      if (ms(r.awarded_at) < ms(cur.first)) cur.first = r.awarded_at;
    } else days.set(k, { userId: r.user_id, courseId: r.course_id, day, first: r.awarded_at, count: 1 });
  }
  for (const d of days.values()) {
    events.push({ userId: d.userId, courseId: d.courseId, at: d.first, kind: "content", delta: d.count, count: d.count });
  }

  events.sort((a, b) => ms(a.at) - ms(b.at));
  return events;
}

export type StarPeriod = "month" | "quarter" | "year" | "all";
export const STAR_PERIODS: { key: StarPeriod; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

export function isStarPeriod(v: string | undefined): v is StarPeriod {
  return STAR_PERIODS.some((p) => p.key === v);
}

/**
 * Where a period starts and where the one before it started, as instants.
 * Calendar periods in UK time; the boundary is taken at UTC midnight, so for
 * an hour either side of a month end during British Summer Time an event can
 * fall a month out. A leaderboard can bear that; the history shows true dates.
 */
export function periodBounds(period: StarPeriod, now: Date): { start: number | null; previous: number | null } {
  if (period === "all") return { start: null, previous: null };
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, year: "numeric", month: "numeric" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value) - 1; // 0-based
  if (period === "month") return { start: Date.UTC(y, m, 1), previous: Date.UTC(y, m - 1, 1) };
  if (period === "quarter") {
    const q = m - (m % 3);
    return { start: Date.UTC(y, q, 1), previous: Date.UTC(y, q - 3, 1) };
  }
  return { start: Date.UTC(y, 0, 1), previous: Date.UTC(y - 1, 0, 1) };
}

export interface PersonStars {
  userId: string;
  total: number;
  assessment: number;
  content: number;
  /** Courses with a passed assessment. */
  coursesPassed: number;
  /** Courses renewed after a certificate expired. */
  renewals: number;
  /** Stars banked in the period. */
  gain: number;
  /** Stars banked in the period before it, for the comparison line. */
  previousGain: number;
  /** When they last banked a star. */
  lastStarAt: string | null;
}

/** One person's figures from their events. */
export function summarise(userId: string, events: StarEvent[], bounds: { start: number | null; previous: number | null }): PersonStars {
  const s: PersonStars = { userId, total: 0, assessment: 0, content: 0, coursesPassed: 0, renewals: 0, gain: 0, previousGain: 0, lastStarAt: null };
  const passed = new Set<string>();
  for (const e of events) {
    if (e.userId !== userId) continue;
    s.total += e.delta;
    if (e.kind === "assessment") {
      s.assessment += e.delta;
      if (e.passed) passed.add(e.courseId);
      if (e.outcome === "renewal") s.renewals++;
    } else s.content += e.delta;
    const t = ms(e.at);
    if (e.delta > 0) {
      if (bounds.start === null || t >= bounds.start) s.gain += e.delta;
      else if (bounds.previous !== null && t >= bounds.previous) s.previousGain += e.delta;
      if (!s.lastStarAt || t > ms(s.lastStarAt)) s.lastStarAt = e.at;
    }
  }
  s.coursesPassed = passed.size;
  return s;
}

/** Stars banked in each of the last `months` UK months, oldest first. */
export function monthlySeries(events: StarEvent[], now: Date, months = 12): { month: string; label: string; stars: number }[] {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, year: "numeric", month: "numeric" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value) - 1;
  const out: { month: string; label: string; stars: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), stars: 0 });
  }
  const byMonth = new Map(out.map((o) => [o.month, o]));
  for (const e of events) {
    const o = byMonth.get(ukMonth(e.at));
    if (o) o.stars += e.delta;
  }
  return out;
}

export interface CourseStars {
  courseId: string;
  /** Best attempt in the current cycle, out of the questions served. */
  best: number;
  questions: number;
  /** Across every cycle. */
  stars: number;
  cycle: number;
  attempts: number;
  passed: boolean;
  /** Stars from the questions along the way in this course. */
  content: number;
}

/** A person's courses, most stars first. */
export function byCourse(events: StarEvent[]): CourseStars[] {
  const map = new Map<string, CourseStars>();
  for (const e of events) {
    const c = map.get(e.courseId) ?? { courseId: e.courseId, best: 0, questions: 0, stars: 0, cycle: 1, attempts: 0, passed: false, content: 0 };
    map.set(e.courseId, c);
    c.stars += e.delta;
    if (e.kind === "content") {
      c.content += e.delta;
      continue;
    }
    c.attempts++;
    if (e.passed) c.passed = true;
    const cycle = e.cycle ?? 1;
    if (cycle > c.cycle) {
      c.cycle = cycle;
      c.best = 0;
    }
    if (cycle === c.cycle && (e.correct ?? 0) > c.best) {
      c.best = Math.min(STARS_PER_COURSE, e.correct ?? 0);
      c.questions = e.questions ?? 0;
    }
  }
  return [...map.values()].sort((a, b) => b.stars - a.stars);
}

/**
 * The rows the maths needs, for a company or for one person in it. RLS does
 * the gating (console users read their company); the filters keep Postgres on
 * the indexes and the bytes down. Paged past 1,000 rows.
 */
export async function loadStarRows(
  supabase: SupabaseClient,
  orgId: string,
  userId?: string,
): Promise<{ attempts: StarAttemptRow[]; certificates: StarCertificateRow[]; content: ContentStarRow[] }> {
  const [attempts, certificates, content] = await Promise.all([
    fetchAll<StarAttemptRow & { id: string }>((f, t) => {
      let q = supabase.from("quiz_attempt_stars").select("id, user_id, course_id, score, passed, questions, submitted_at").eq("organisation_id", orgId);
      if (userId) q = q.eq("user_id", userId);
      return q.order("id").range(f, t);
    }),
    fetchAll<StarCertificateRow & { id: string }>((f, t) => {
      let q = supabase.from("certificates").select("id, user_id, course_id, expires_at").eq("organisation_id", orgId);
      if (userId) q = q.eq("user_id", userId);
      return q.order("id").range(f, t);
    }),
    fetchAll<ContentStarRow & { id: string }>((f, t) => {
      let q = supabase.from("content_question_stars").select("id, user_id, course_id, awarded_at").eq("organisation_id", orgId);
      if (userId) q = q.eq("user_id", userId);
      return q.order("id").range(f, t);
    }),
  ]);
  return { attempts, certificates, content };
}

/** "Today", "Yesterday", or the date. */
export function whenLabel(iso: string | null, now: Date, format: (iso: string) => string): string {
  if (!iso) return "—";
  const a = ukDay(iso);
  const b = ukDay(now.toISOString());
  if (a === b) return "Today";
  const y = new Date(now.getTime() - 86_400_000);
  if (a === ukDay(y.toISOString())) return "Yesterday";
  return format(iso);
}

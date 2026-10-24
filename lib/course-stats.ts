import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import {
  courseOf,
  loadCourseIndex,
  loadOrgPeople,
  type OrgTraining,
} from "@/lib/org-learners";

export interface CourseStatsRow {
  id: string;
  title: string;
  assigned: number;
  attempts: number;
  inProgress: number;
  completions: number;
  /** The course's expected duration in seconds (courses.estimated_minutes),
   *  null when the course has no estimate set. */
  expectedSeconds: number | null;
  /** Completion-time stats in seconds, from tracked in-course time. Null when
   *  no completed enrolment has any tracked time. */
  quickestSeconds: number | null;
  longestSeconds: number | null;
  averageSeconds: number | null;
}

/** Nobody has been assigned it and nobody has attempted it. */
export const isUnused = (c: CourseStatsRow) =>
  c.assigned === 0 && c.attempts === 0;

/** One enrolment — the raw rows the per-course rollup above is built from. */
export interface CourseEnrolmentRow {
  courseId: string;
  course: string;
  userId: string;
  learner: string;
  status: string;
  /** Content completion 0-100 — with status, tells "read it all, hasn't sat
   *  the assessment" apart from a plain half-finished course (issue #25). */
  progress: number;
  attempts: number;
  expectedSeconds: number | null;
  /** Tracked in-course time. Null when nothing has been tracked yet. */
  actualSeconds: number | null;
  /** When they completed it — from the newest certificate, since enrolments
   *  carry no completed_at. Null unless completed (issue #23). */
  completedAt: string | null;
  /** Newest certificate for this learner + course, for the download link. */
  certificateId: string | null;
}

const minutesToSeconds = (m: number | null | undefined) =>
  typeof m === "number" && m > 0 ? m * 60 : null;

/**
 * Per-course rollup for the Courses → Overview table: how many staff are
 * assigned, quiz attempts, in-progress and completion counts, the course's
 * expected duration and the shortest/longest/average time to complete
 * (tracked in-course time of completed enrolments).
 *
 * Pass orgId wherever it is known: RLS still decides what may be read, but the
 * filter lets Postgres use the organisation_id index rather than testing the
 * policy on every row. Pass `training` when the page has already read (or is
 * reading) the organisation's enrolments, so they aren't fetched twice.
 */
export async function loadCourseStats(
  supabase: SupabaseClient,
  orgId?: string | null,
  training?: OrgTraining | Promise<OrgTraining>,
): Promise<CourseStatsRow[]> {
  // Paged: enrolments and attempts pass 1,000 rows at one ordinary-sized
  // organisation, and Supabase would silently drop the rest.
  const [{ data: courses }, enrolments, attempts] = await Promise.all([
    supabase.from("courses").select("id, title, estimated_minutes").order("title"),
    training
      ? Promise.resolve(training).then((t) => t.enrolments)
      : fetchAll<{ id: string; course_id: string; status: string; time_spent: number | null }>(
          (f, t) => {
            let q = supabase.from("enrolments").select("id, course_id, status, time_spent");
            if (orgId) q = q.eq("organisation_id", orgId);
            return q.order("id").range(f, t);
          },
        ),
    // Every submitted attempt ever, for one number per course. Only the
    // course id comes back, but the row count still grows with history — see
    // the org_course_attempt_counts() proposal in the egress review.
    fetchAll((f, t) => {
      let q = supabase
        .from("quiz_attempts")
        .select("id, course_id")
        .not("submitted_at", "is", null);
      if (orgId) q = q.eq("organisation_id", orgId);
      return q.order("id").range(f, t);
    }),
  ]);

  const attemptCount = new Map<string, number>();
  for (const a of attempts ?? []) {
    attemptCount.set(a.course_id, (attemptCount.get(a.course_id) ?? 0) + 1);
  }

  const byCourse = new Map<
    string,
    { assigned: number; inProgress: number; completions: number; times: number[] }
  >();
  for (const e of enrolments ?? []) {
    const agg =
      byCourse.get(e.course_id) ??
      { assigned: 0, inProgress: 0, completions: 0, times: [] };
    agg.assigned += 1;
    if (e.status === "in_progress") agg.inProgress += 1;
    if (e.status === "completed") {
      agg.completions += 1;
      if (e.time_spent && e.time_spent > 0) agg.times.push(e.time_spent);
    }
    byCourse.set(e.course_id, agg);
  }

  return (courses ?? [])
    .map((c) => {
      const agg =
        byCourse.get(c.id) ??
        { assigned: 0, inProgress: 0, completions: 0, times: [] };
      const times = agg.times;
      return {
        id: c.id,
        title: c.title as string,
        assigned: agg.assigned,
        attempts: attemptCount.get(c.id) ?? 0,
        inProgress: agg.inProgress,
        completions: agg.completions,
        expectedSeconds: minutesToSeconds(c.estimated_minutes),
        quickestSeconds: times.length ? Math.min(...times) : null,
        longestSeconds: times.length ? Math.max(...times) : null,
        averageSeconds: times.length
          ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
          : null,
      };
    });
    // Unused catalogue courses are kept and marked rather than dropped: a
    // manager building a training matrix needs to see what is AVAILABLE, not
    // only what has already been assigned (issue #33). The table hides them by
    // default so the common view is unchanged.
}

/**
 * Courses → Statistics: one row per enrolment (learner × course) — the raw
 * data behind every number in the Overview table. Assigned/in progress/
 * completions are the row counts per status; shortest/longest/average are the
 * min/max/mean of the actual-time column over completed rows.
 *
 * `courseId` narrows every read to one course (the `?course=` view), rather
 * than reading the whole organisation and throwing most of it away. Course
 * titles and learner names come from one lookup each instead of being
 * embedded on every enrolment row.
 */
export async function loadCourseEnrolmentRows(
  supabase: SupabaseClient,
  orgId?: string | null,
  courseId?: string | null,
): Promise<CourseEnrolmentRow[]> {
  const [enrolments, attempts, certs, courses, people] = await Promise.all([
    fetchAll((f, t) => {
      let q = supabase
        .from("enrolments")
        .select("id, user_id, course_id, status, progress, time_spent");
      if (orgId) q = q.eq("organisation_id", orgId);
      if (courseId) q = q.eq("course_id", courseId);
      return q.order("id").range(f, t);
    }),
    fetchAll((f, t) => {
      let q = supabase
        .from("quiz_attempts")
        .select("id, user_id, course_id")
        .not("submitted_at", "is", null);
      if (orgId) q = q.eq("organisation_id", orgId);
      if (courseId) q = q.eq("course_id", courseId);
      return q.order("id").range(f, t);
    }),
    fetchAll((f, t) => {
      let q = supabase.from("certificates").select("id, user_id, course_id, issued_at");
      if (orgId) q = q.eq("organisation_id", orgId);
      if (courseId) q = q.eq("course_id", courseId);
      return q.order("id").range(f, t);
    }),
    loadCourseIndex(supabase),
    loadOrgPeople(supabase, orgId),
  ]);

  // Newest certificate per learner + course — that issue date is the
  // completion date, and its id is what the download link needs.
  const certByPair = new Map<string, { id: string; issuedAt: string }>();
  for (const c of certs ?? []) {
    const key = `${c.user_id}:${c.course_id}`;
    const prev = certByPair.get(key);
    if (!prev || c.issued_at > prev.issuedAt)
      certByPair.set(key, { id: c.id as string, issuedAt: c.issued_at as string });
  }

  const attemptCount = new Map<string, number>();
  for (const a of attempts ?? []) {
    const key = `${a.user_id}:${a.course_id}`;
    attemptCount.set(key, (attemptCount.get(key) ?? 0) + 1);
  }

  return (enrolments ?? [])
    .map((e) => {
      const c = courseOf(courses, e.course_id as string);
      const u = people.get(e.user_id as string);
      const cert = certByPair.get(`${e.user_id}:${e.course_id}`) ?? null;
      return {
        courseId: e.course_id as string,
        course: c.title,
        userId: e.user_id as string,
        learner: u?.full_name || u?.email || "Learner",
        status: e.status as string,
        progress: (e.progress as number) ?? 0,
        attempts: attemptCount.get(`${e.user_id}:${e.course_id}`) ?? 0,
        expectedSeconds: minutesToSeconds(c.estimatedMinutes),
        actualSeconds: e.time_spent && e.time_spent > 0 ? e.time_spent : null,
        completedAt: e.status === "completed" ? (cert?.issuedAt ?? null) : null,
        certificateId: e.status === "completed" ? (cert?.id ?? null) : null,
      };
    })
    .sort(
      (a, b) =>
        a.course.localeCompare(b.course) || a.learner.localeCompare(b.learner),
    );
}

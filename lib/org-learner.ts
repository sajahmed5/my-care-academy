import type { SupabaseClient } from "@supabase/supabase-js";
import type { Enrolment, Certificate } from "@/lib/learner-stats";

/** An enrolment plus the time the learner has spent in the course content. */
export interface OrgEnrolment extends Enrolment {
  time_spent: number; // seconds
  /** When a reminder last went out for this enrolment, so the staff page can
   *  show it under its Remind button the way the learners list does. */
  last_reminder_at: string | null;
}

/** One submitted assessment attempt. */
export interface AttemptRow {
  score: number;
  passed: boolean;
  started_at: string;
  submitted_at: string;
}

/** All assessment attempts for one course, newest first. */
export interface CourseAssessment {
  attempts: number;
  best: number | null;
  passed: boolean;
  history: AttemptRow[];
}

export interface OrgLearnerProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  /** Null = never signed in, so the Remind button sends a set-password link
   *  rather than a "finish your training" nudge (issue #27). */
  last_seen_at: string | null;
}

export interface OrgLearnerTraining {
  profile: OrgLearnerProfile | null;
  enrolments: OrgEnrolment[];
  certificates: Certificate[];
  /** Keyed by course_id. */
  assessments: Map<string, CourseAssessment>;
}

interface JoinedCourse {
  title?: string;
  topics?: { title?: string } | null;
}
function pickCourse(row: { courses?: unknown }): JoinedCourse {
  return (row.courses as JoinedCourse) ?? {};
}

/**
 * Load one learner's full training record for the org-admin detail view.
 * Every query is filtered by user_id; RLS additionally confines results to the
 * caller's own organisation, so an admin can only ever load their own staff.
 */
export async function loadOrgLearnerTraining(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrgLearnerTraining> {
  const [{ data: profile }, { data: enrRaw }, { data: certRaw }, { data: attRaw }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, full_name, email, role, status, last_seen_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("enrolments")
        .select(
          "id, course_id, status, progress, time_spent, due_date, assigned_at, attempt_count, completion_count, last_reminder_at, courses(title, topics(title))",
        )
        .eq("user_id", userId)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("certificates")
        .select(
          "id, course_id, certificate_number, issued_at, expires_at, courses(title, topics(title))",
        )
        .eq("user_id", userId)
        .order("issued_at", { ascending: false }),
      supabase
        .from("quiz_attempts")
        .select("course_id, score, passed, started_at, submitted_at")
        .eq("user_id", userId)
        .order("started_at", { ascending: false }),
    ]);

  const enrolments: OrgEnrolment[] = (enrRaw ?? []).map((e) => {
    const c = pickCourse(e);
    return {
      id: e.id,
      course_id: e.course_id,
      status: e.status,
      progress: e.progress,
      time_spent: e.time_spent ?? 0,
      due_date: e.due_date,
      assigned_at: e.assigned_at,
      attempt_count: e.attempt_count ?? 0,
      completion_count: e.completion_count ?? 0,
      last_reminder_at: e.last_reminder_at ?? null,
      title: c.title ?? "Course",
      topic: c.topics?.title ?? null,
    };
  });

  const certificates: Certificate[] = (certRaw ?? []).map((c) => {
    const co = pickCourse(c);
    return {
      id: c.id,
      course_id: c.course_id,
      number: c.certificate_number,
      issued_at: c.issued_at,
      expires_at: c.expires_at,
      title: co.title ?? "Course",
      topic: co.topics?.title ?? null,
    };
  });

  // Only submitted attempts have a real score; group them per course.
  const assessments = new Map<string, CourseAssessment>();
  for (const a of attRaw ?? []) {
    if (!a.submitted_at) continue;
    const cur =
      assessments.get(a.course_id) ??
      ({ attempts: 0, best: null, passed: false, history: [] } as CourseAssessment);
    cur.attempts += 1;
    cur.best = cur.best == null ? a.score : Math.max(cur.best, a.score);
    cur.passed = cur.passed || !!a.passed;
    cur.history.push({
      score: a.score,
      passed: !!a.passed,
      started_at: a.started_at,
      submitted_at: a.submitted_at,
    });
    assessments.set(a.course_id, cur);
  }

  return {
    profile: (profile as OrgLearnerProfile | null) ?? null,
    enrolments,
    certificates,
    assessments,
  };
}

/** Human-readable duration from a count of seconds. */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

import { daysUntil, expiryFlag, isOverdue } from "@/lib/engine-logic";

/*
 * A learner's training record as plain data, and the sums over it. Kept apart
 * from lib/learner-data.ts, which reads the database through the server
 * client: the org learners table is a client component and imports these
 * through lib/org-learners.ts, so anything here ships to the browser.
 */

export interface Enrolment {
  id: string;
  course_id: string;
  status: string;
  progress: number;
  due_date: string | null;
  assigned_at: string;
  attempt_count: number;
  completion_count: number;
  title: string;
  topic: string | null;
}

export interface Certificate {
  id: string;
  course_id: string;
  number: string;
  issued_at: string;
  expires_at: string | null;
  title: string;
  topic: string | null;
}

export interface LearnerStats {
  assigned: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  expired: number;
  certificates: number;
  overdue: number;
  /** Not completed, has a due date inside 60 days, and not yet overdue —
   *  the window where chasing still prevents a breach (issue #29). */
  dueSoon: number;
  expiring: number;
  completionPct: number;
  overallPct: number;
}

export function learnerStats(
  enrolments: Enrolment[],
  certificates: Certificate[],
  now: Date,
): LearnerStats {
  const assigned = enrolments.length;
  const completed = enrolments.filter((e) => e.status === "completed").length;
  const overdue = enrolments.filter((e) =>
    isOverdue(e.due_date, e.status, now),
  ).length;
  // Deliberately excludes anything already overdue: that has its own, louder
  // line, and a name should not appear under both.
  const dueSoon = enrolments.filter((e) => {
    if (e.status === "completed" || !e.due_date) return false;
    if (isOverdue(e.due_date, e.status, now)) return false;
    return daysUntil(new Date(e.due_date), now) <= 60;
  }).length;

  // Expiring = latest cert per course flagged amber/red but not yet expired.
  const latest = new Map<string, Certificate>();
  for (const c of certificates) if (!latest.has(c.course_id)) latest.set(c.course_id, c);
  const expiring = [...latest.values()].filter((c) => {
    const f = expiryFlag(c.expires_at ? new Date(c.expires_at) : null, now);
    return f === "amber" || f === "red";
  }).length;

  // Overall progress counts partly-finished courses, not just completed ones,
  // so a learner mid-way through several courses isn't shown a demoralising
  // low number. A completed course counts as 100%; others use their content
  // progress. completionPct (completed / assigned) is kept for anything that
  // needs the strict "fully done" ratio.
  const overallPct =
    assigned > 0
      ? Math.round(
          enrolments.reduce(
            (sum, e) => sum + (e.status === "completed" ? 100 : e.progress),
            0,
          ) / assigned,
        )
      : 0;

  return {
    assigned,
    notStarted: enrolments.filter((e) => e.status === "not_started").length,
    inProgress: enrolments.filter((e) => e.status === "in_progress").length,
    completed,
    expired: enrolments.filter((e) => e.status === "expired").length,
    certificates: certificates.length,
    overdue,
    dueSoon,
    expiring,
    completionPct: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
    overallPct,
  };
}

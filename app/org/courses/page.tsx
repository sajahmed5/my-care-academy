import {
  BadgeAlert,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock,
} from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/learner-ui";
import { isActiveLearner, loadOrgLearners } from "@/lib/org-learners";
import { loadCourseStats } from "@/lib/course-stats";
import { CourseStatsTable } from "./course-stats-table";

/**
 * Courses overview: the course headline numbers (active staff only) over the
 * per-course rollup table — every tile links down to it (design doc v3), so a
 * headline number and the courses behind it are one page apart.
 */
export default async function CoursesOverviewPage() {
  await requireConsole();
  const supabase = await createClient();
  const [learnerRows, rows, { data: organisation }] = await Promise.all([
    loadOrgLearners(supabase),
    loadCourseStats(supabase),
    supabase.from("organisations").select("name").single(),
  ]);
  const learners = learnerRows.filter(isActiveLearner);

  const totals = learners.reduce(
    (t, r) => ({
      assigned: t.assigned + r.stats.assigned,
      completed: t.completed + r.stats.completed,
      inProgress: t.inProgress + r.stats.inProgress,
      notStarted: t.notStarted + r.stats.notStarted,
      overdue: t.overdue + r.stats.overdue,
      late: t.late + r.lateCompletions,
    }),
    {
      assigned: 0,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
      overdue: 0,
      late: 0,
    },
  );
  // Same six figures as the dashboard's Courses section, in the same order and
  // the same two rows (issue #28) — a manager who reads them there shouldn't
  // have to re-learn them here.
  const pct = (n: number) =>
    totals.assigned > 0 ? Math.round((n / totals.assigned) * 100) : 0;
  const overallPct = pct(totals.completed);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile
          label="Assigned training complete"
          value={`${overallPct}%`}
          icon={CheckCircle2}
          color="#10b981"
          hint={`${totals.completed} of ${totals.assigned} courses`}
          href="#courses"
        />
        <StatTile
          label="In progress"
          value={`${pct(totals.inProgress)}%`}
          icon={Clock}
          color="#f59e0b"
          hint={`${totals.inProgress} of ${totals.assigned} courses`}
          href="/org/learners/statistics?status=in_progress"
        />
        <StatTile
          label="Not started"
          value={`${pct(totals.notStarted)}%`}
          icon={CircleDashed}
          color="#64748b"
          hint={`${totals.notStarted} of ${totals.assigned} courses`}
          href="/org/learners/statistics?status=not_started"
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile
          label="Overdue"
          value={totals.overdue}
          icon={BadgeAlert}
          color="#ef4444"
          href="/org/learners/statistics?status=overdue"
        />
        <StatTile
          label="Completed"
          value={totals.completed}
          icon={BookOpenCheck}
          color="#16a34a"
          href="/org/learners/statistics?status=completed"
        />
        <StatTile
          label="Completed late"
          value={totals.late}
          icon={CalendarClock}
          color="#f97316"
          href="/org/learners/statistics?status=late"
        />
      </div>

      <section id="courses" className="scroll-mt-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Courses
        </h2>
        <CourseStatsTable
          rows={rows}
          filename={`${organisation?.name ?? "org"}-course-statistics.csv`}
        />
      </section>
    </div>
  );
}

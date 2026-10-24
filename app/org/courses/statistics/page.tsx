import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCourseEnrolmentRows } from "@/lib/course-stats";
import { CourseEnrolmentsTable } from "./course-enrolments-table";

/**
 * Courses → Statistics: the raw data behind the Overview rollup — one row per
 * enrolment (learner × course) with the course's expected duration next to
 * what the learner actually took (design doc v3).
 *
 * `?course=` narrows it to a single course. That view replaces the old
 * standalone coverage page: clicking a course name anywhere now lands here,
 * filtered, rather than on a separate screen with its own layout (issue #23).
 */
export default async function CourseStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const context = await requireConsole();
  const orgId = context.organisationId;
  const { course } = await searchParams;
  const supabase = await createClient();
  // One course asks the database for one course, rather than reading every
  // enrolment in the organisation and filtering here. A mangled id (these
  // links get pasted) matches nothing, as the old in-memory filter did,
  // instead of failing the uuid cast.
  const badCourse = !!course && !/^[0-9a-f-]{36}$/i.test(course);
  const [rows, { data: organisation }] = await Promise.all([
    badCourse
      ? Promise.resolve([])
      : loadCourseEnrolmentRows(supabase, orgId, course || null),
    supabase.from("organisations").select("name").eq("id", orgId!).single(),
  ]);

  const courseName = course ? (rows[0]?.course ?? "this course") : null;
  const org = organisation?.name ?? "org";

  return (
    <div className="space-y-3">
      {courseName && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {courseName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "learner" : "learners"} assigned
              this course.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/org/certificates/pack?course=${course}`}
              className="inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-medium transition-colors hover:bg-accent sm:min-h-9"
            >
              Certificates for this course (ZIP)
            </a>
            <Link
              href="/org/courses/statistics"
              className="inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-medium transition-colors hover:bg-accent sm:min-h-9"
            >
              Show all courses
            </Link>
          </div>
        </div>
      )}
      <CourseEnrolmentsTable
        rows={rows}
        showCourse={!course}
        filename={
          courseName
            ? `${org}-${courseName}.csv`
            : `${org}-course-enrolments.csv`
        }
      />
    </div>
  );
}

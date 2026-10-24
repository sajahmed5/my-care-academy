import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCertificates, loadEnrolments } from "@/lib/learner-data";

/** One standard within a programme, with the learner's status for it. */
export interface ProgrammeStandard {
  standardNo: number;
  label: string;
  courseId: string;
  courseTitle: string;
  topic: string | null;
  /** Enrolment status, or "not_enrolled" when the learner has no enrolment. */
  status: string;
  progress: number;
  dueDate: string | null;
  /** True if the learner holds a (live) certificate for this standard's course. */
  certificated: boolean;
  /**
   * Workplace-observation outcome for this standard, when the org has the
   * observation add-on and an assessor has recorded one. Filled in by the
   * programme page (not the shared loader), so the dashboard stays independent
   * of the 2B tables.
   */
  observationStatus?: "pending" | "competent" | "not_yet_competent" | null;
}

export interface Programme {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  complianceNote: string | null;
  standards: ProgrammeStandard[];
  completedCount: number;
  total: number;
}

/**
 * Load a programme (e.g. the Care Certificate) with each standard's course and
 * the current learner's status for it. Single owner of the pathway ->
 * pathway_courses -> courses join, used by both the dashboard card and the
 * programme landing page.
 *
 * One round trip: the pathway and its standards come back in a single embedded
 * read, alongside the learner's enrolments and certificates — which are the
 * per-request shared reads, so on the dashboard (which lists them anyway) they
 * cost nothing extra.
 *
 * Returns null if the programme slug does not exist (e.g. before seeding).
 */
export async function loadProgramme(
  supabase: SupabaseClient,
  slug: string,
  userId: string,
): Promise<Programme | null> {
  const [{ data: pathway }, enrolments, certificates] = await Promise.all([
    supabase
      .from("pathways")
      .select(
        "id, slug, title, summary, compliance_note, pathway_courses(standard_no, label, course:courses(id, title, topic:topics(title)))",
      )
      .eq("slug", slug)
      .maybeSingle(),
    loadEnrolments(userId),
    loadCertificates(userId),
  ]);
  if (!pathway) return null;

  // PostgREST types a to-one embed as an array; normalise to the first element.
  const one = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  type JoinedCourse = {
    id: string;
    title: string;
    topic?: { title?: string | null } | { title?: string | null }[] | null;
  };
  type JoinedLink = {
    standard_no: number | null;
    label: string | null;
    course: JoinedCourse | JoinedCourse[] | null;
  };
  // Standard order, unnumbered last — as `order by standard_no` would give.
  const rows = [
    ...((pathway.pathway_courses ?? []) as unknown as JoinedLink[]),
  ].sort(
    (a, b) =>
      (a.standard_no ?? Number.POSITIVE_INFINITY) -
      (b.standard_no ?? Number.POSITIVE_INFINITY),
  );

  const enrolByCourse = new Map(enrolments.map((e) => [e.course_id, e]));
  const certCourseIds = new Set(certificates.map((c) => c.course_id));

  const standards: ProgrammeStandard[] = rows
    .map((l) => {
      const course = one(l.course);
      if (!course) return null;
      const enrol = enrolByCourse.get(course.id);
      return {
        standardNo: l.standard_no ?? 0,
        label: l.label ?? course.title,
        courseId: course.id,
        courseTitle: course.title,
        topic: one(course.topic)?.title ?? null,
        status: enrol?.status ?? "not_enrolled",
        progress: enrol?.progress ?? 0,
        dueDate: enrol?.due_date ?? null,
        certificated: certCourseIds.has(course.id),
      } satisfies ProgrammeStandard;
    })
    .filter((s): s is ProgrammeStandard => s !== null);

  const completedCount = standards.filter(
    (s) => s.status === "completed",
  ).length;

  return {
    id: pathway.id,
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    complianceNote: pathway.compliance_note,
    standards,
    completedCount,
    total: standards.length,
  };
}

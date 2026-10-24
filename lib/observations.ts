import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";

export type ObservationStatus = "pending" | "competent" | "not_yet_competent";
export const OBSERVATION_STATUSES: ObservationStatus[] = [
  "pending",
  "competent",
  "not_yet_competent",
];

export interface StandardObservation {
  standardNo: number;
  label: string;
  courseId: string | null;
  courseTitle: string | null;
  /** Knowledge signal: the learner has completed the standard's course. */
  knowledgeComplete: boolean;
  status: ObservationStatus;
  observedAt: string | null;
  notes: string | null;
  assessorKind: "org" | "mca" | null;
  evidencePath: string | null;
}

export interface LearnerCareCert {
  userId: string;
  fullName: string;
  standards: StandardObservation[];
  knowledgeComplete: number;
  observedCompetent: number;
  total: number;
  signedOff: { signedAt: string } | null;
  /** All knowledge complete AND all observed competent AND not yet signed off. */
  eligibleToAward: boolean;
}

const CARE_CERT_SLUG = "care-certificate";

/** to-one embed helper (PostgREST types the relation as an array). */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * The full Care Certificate picture for one learner: each of the 16 standards
 * with its knowledge status (course completed) and its workplace observation,
 * plus whether the employer may now award. Reads go through the caller's
 * RLS-scoped client — an org_admin only ever resolves their own org's data.
 */
export async function loadLearnerCareCert(
  supabase: SupabaseClient,
  userId: string,
): Promise<LearnerCareCert | null> {
  // Everything that does not depend on the pathway's courses is read at once;
  // only the enrolments wait for the course ids. (It was five reads in series.)
  const [{ data: user }, { data: pathway }, { data: observations }, { data: signoff }] =
    await Promise.all([
      supabase.from("users").select("id, full_name, email").eq("id", userId).maybeSingle(),
      supabase
        .from("pathways")
        .select("id, pathway_courses (standard_no, label, course:courses(id, title))")
        .eq("slug", CARE_CERT_SLUG)
        .maybeSingle(),
      supabase
        .from("care_cert_observations")
        .select("standard_no, status, observed_at, notes, assessor_kind, evidence_path")
        .eq("user_id", userId),
      supabase
        .from("care_cert_signoffs")
        .select("signed_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  if (!user || !pathway) return null;

  type Link = { standard_no: number | null; label: string | null; course: unknown };
  const links = [...((pathway.pathway_courses as Link[] | null) ?? [])].sort(
    (a, b) => (a.standard_no ?? 0) - (b.standard_no ?? 0),
  );

  const courseIds = links
    .map((l) => one(l.course as { id?: string } | { id?: string }[])?.id)
    .filter((id): id is string => Boolean(id));
  const { data: enrolments } = courseIds.length
    ? await supabase
        .from("enrolments")
        .select("course_id, status")
        .eq("user_id", userId)
        .in("course_id", courseIds)
    : { data: [] as { course_id: string; status: string }[] };

  const completedCourseIds = new Set(
    (enrolments ?? []).filter((e) => e.status === "completed").map((e) => e.course_id),
  );
  const obsByStandard = new Map(
    (observations ?? []).map((o) => [o.standard_no, o]),
  );

  const standards: StandardObservation[] = links.map((l) => {
    const course = one(l.course as { id: string; title: string } | { id: string; title: string }[]);
    const obs = obsByStandard.get(l.standard_no);
    return {
      standardNo: l.standard_no ?? 0,
      label: l.label ?? course?.title ?? `Standard ${l.standard_no}`,
      courseId: course?.id ?? null,
      courseTitle: course?.title ?? null,
      knowledgeComplete: course ? completedCourseIds.has(course.id) : false,
      status: (obs?.status as ObservationStatus) ?? "pending",
      observedAt: obs?.observed_at ?? null,
      notes: obs?.notes ?? null,
      assessorKind: (obs?.assessor_kind as "org" | "mca" | null) ?? null,
      evidencePath: obs?.evidence_path ?? null,
    };
  });

  const knowledgeComplete = standards.filter((s) => s.knowledgeComplete).length;
  const observedCompetent = standards.filter((s) => s.status === "competent").length;
  const total = standards.length;
  const signedOff = signoff ? { signedAt: signoff.signed_at } : null;

  return {
    userId: user.id,
    fullName: user.full_name || user.email || "Learner",
    standards,
    knowledgeComplete,
    observedCompetent,
    total,
    signedOff,
    eligibleToAward:
      total > 0 &&
      knowledgeComplete === total &&
      observedCompetent === total &&
      !signedOff,
  };
}

/** Lightweight per-learner rollup for the console list (no per-standard detail). */
export interface LearnerRollup {
  userId: string;
  fullName: string;
  observedCompetent: number;
  total: number;
  signedOff: boolean;
}

/**
 * Roll up observation progress for every learner in the org, for the console
 * list. One query each for the org's learners, their competent observations,
 * and their sign-offs.
 */
export async function loadOrgObservationRollup(
  supabase: SupabaseClient,
  organisationId: string,
  total = 16,
): Promise<LearnerRollup[]> {
  // All three by organisation, at once. The observations and sign-offs used to
  // wait for the staff list and then carry every id in the URL, which an
  // organisation of a few hundred would push past the URL limit.
  const [{ data: staff }, observations, { data: signoffs }] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email, status")
      .eq("organisation_id", organisationId)
      .order("full_name", { ascending: true })
      .limit(1000),
    fetchAll<{ id: string; user_id: string }>((from, to) =>
      supabase
        .from("care_cert_observations")
        .select("id, user_id")
        .eq("organisation_id", organisationId)
        .eq("status", "competent")
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("care_cert_signoffs")
      .select("user_id")
      .eq("organisation_id", organisationId)
      .limit(1000),
  ]);

  const learners = (staff ?? []).filter((u) => (u.status ?? "active") === "active");
  if (!learners.length) return [];

  const competentByUser = new Map<string, number>();
  for (const o of observations) {
    competentByUser.set(o.user_id, (competentByUser.get(o.user_id) ?? 0) + 1);
  }
  const signedOffUsers = new Set((signoffs ?? []).map((s) => s.user_id));

  return learners.map((u) => ({
    userId: u.id,
    fullName: u.full_name || u.email || "Learner",
    observedCompetent: competentByUser.get(u.id) ?? 0,
    total,
    signedOff: signedOffUsers.has(u.id),
  }));
}

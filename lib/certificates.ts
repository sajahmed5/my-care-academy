import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import { daysUntil } from "@/lib/engine-logic";
import { courseOf, loadCourseIndex, loadOrgPeople } from "@/lib/org-learners";

export type CertState =
  | "expired"
  | "due_30"
  | "due_60"
  | "valid"
  | "no_expiry";

export interface OrgCertificateRow {
  id: string;
  number: string;
  userId: string;
  learner: string;
  courseId: string;
  course: string;
  issuedAt: string;
  expiresAt: string | null;
  /** Negative once it has lapsed. Null when the certificate never expires. */
  daysLeft: number | null;
  state: CertState;
}

/** Expired or expiring — the rows the "needs attention" default shows. */
export const needsAttention = (r: OrgCertificateRow) =>
  r.state === "expired" || r.state === "due_30" || r.state === "due_60";

/**
 * Which renewal band a certificate sits in. Exported so the boundaries are
 * testable: expiryFlag conflates "expired" with "expiring inside 30 days" as
 * one red, which is fine for a dot but useless for a work list.
 */
export function certificateState(
  expiresAt: string | null,
  now: Date,
): { state: CertState; daysLeft: number | null } {
  if (!expiresAt) return { state: "no_expiry", daysLeft: null };
  const daysLeft = daysUntil(new Date(expiresAt), now);
  if (daysLeft < 0) return { state: "expired", daysLeft };
  if (daysLeft <= 30) return { state: "due_30", daysLeft };
  if (daysLeft <= 60) return { state: "due_60", daysLeft };
  return { state: "valid", daysLeft };
}

/**
 * Every certificate the organisation holds, newest-first by expiry urgency.
 *
 * Only the most recent certificate per learner + course is returned: a renewal
 * supersedes the one before it, and listing a superseded certificate as
 * "expired" would send someone chasing training that has already been redone.
 * This matches how learnerStats counts `expiring`, which is what the dashboard
 * warning shows.
 *
 * Deactivated learners are left out — a leaver's lapsed certificate is history,
 * not a job. RLS scopes every read to the caller's organisation; pass orgId
 * as well so Postgres walks the organisation_id index instead of testing the
 * policy on every row.
 */
export async function loadOrgCertificates(
  supabase: SupabaseClient,
  orgId?: string | null,
  now: Date = new Date(),
): Promise<OrgCertificateRow[]> {
  // Paged (Supabase silently caps a read at 1,000 rows), then put back into
  // newest-first order: the loop below keeps the FIRST certificate it sees per
  // learner + course as the live one. Names and titles come from one lookup
  // each rather than embedded on every certificate.
  const [certs, courses, people] = await Promise.all([
    fetchAll((f, t) => {
      let q = supabase
        .from("certificates")
        .select("id, certificate_number, user_id, course_id, issued_at, expires_at");
      if (orgId) q = q.eq("organisation_id", orgId);
      return q.order("id").range(f, t);
    }),
    loadCourseIndex(supabase),
    loadOrgPeople(supabase, orgId),
  ]);
  const data = certs.sort((a, b) =>
    String(b.issued_at).localeCompare(String(a.issued_at)),
  );

  const latest = new Map<string, OrgCertificateRow>();
  for (const c of data) {
    const u = people.get(c.user_id as string);
    if (u?.status === "deactivated") continue;

    // Ordered newest-first, so the first one seen for a pair is the live one.
    const key = `${c.user_id}:${c.course_id}`;
    if (latest.has(key)) continue;

    const { state, daysLeft } = certificateState(c.expires_at as string | null, now);
    latest.set(key, {
      id: c.id as string,
      number: (c.certificate_number as string) ?? "",
      userId: c.user_id as string,
      learner: u?.full_name || u?.email || "Learner",
      courseId: c.course_id as string,
      course: courseOf(courses, c.course_id as string).title,
      issuedAt: c.issued_at as string,
      expiresAt: c.expires_at as string | null,
      daysLeft,
      state,
    });
  }

  // Most urgent first: longest-expired at the top, never-expires at the bottom.
  return [...latest.values()].sort((a, b) => {
    if (a.daysLeft === null && b.daysLeft === null)
      return a.learner.localeCompare(b.learner);
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft || a.learner.localeCompare(b.learner);
  });
}

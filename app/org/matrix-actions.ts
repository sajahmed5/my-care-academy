"use server";

import { STAFF_ROLES } from "@/lib/roles";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cellText } from "@/lib/matrix";
import { fetchAll } from "@/lib/fetch-all";
import { courseOf, loadCourseIndex } from "@/lib/org-learners";

export interface MatrixCourse {
  id: string;
  title: string;
  topic: string | null;
}

export interface MatrixRow {
  name: string;
  email: string;
  /** "Active" or "Left" — a leaver's row is history, not a gap to chase. */
  status: string;
  /** courseId -> cell text; never blank, see cellText. */
  cells: Record<string, string>;
}


export interface TrainingMatrix {
  courses: MatrixCourse[];
  rows: MatrixRow[];
}

/**
 * Build the org's training matrix: every staff member as a row, every course
 * used in the org as a column, each cell showing the completion → expiry dates
 * from the learner's newest certificate for that course. RLS scopes all reads
 * to the caller's own organisation; the explicit organisation filter is for
 * the planner (index, not a per-row policy test).
 */
export async function exportTrainingMatrixAction(
  options: { includeLeavers?: boolean } = {},
): Promise<TrainingMatrix> {
  const context = await requireConsole();
  const orgId = context.organisationId;
  const supabase = await createClient();

  // Paged. These were plain reads, so past 1,000 enrolments (about 62 carers
  // on 16 courses) the matrix silently came out with blanks — on the one
  // document inspectors actually ask for. Course names come from one lookup
  // rather than being embedded on every enrolment and certificate.
  const [usersAll, enrolments, certsAll, catalogue] = await Promise.all([
    fetchAll((f, t) => {
      let q = supabase
        .from("users")
        .select("id, full_name, email, status")
        .in("role", STAFF_ROLES);
      if (orgId) q = q.eq("organisation_id", orgId);
      return q.order("id").range(f, t);
    }),
    fetchAll((f, t) => {
      let q = supabase.from("enrolments").select("id, user_id, course_id, status");
      if (orgId) q = q.eq("organisation_id", orgId);
      return q.order("id").range(f, t);
    }),
    fetchAll((f, t) => {
      let q = supabase
        .from("certificates")
        .select("id, user_id, course_id, issued_at, expires_at");
      if (orgId) q = q.eq("organisation_id", orgId);
      return q.order("id").range(f, t);
    }),
    loadCourseIndex(supabase),
  ]);
  // Name order as before (blank names last, as Postgres put them); newest
  // certificate first, which the newestCert loop below relies on.
  const users = [...usersAll].sort((a, b) =>
    a.full_name == null
      ? b.full_name == null ? 0 : 1
      : b.full_name == null ? -1 : String(a.full_name).localeCompare(String(b.full_name)),
  );
  const certs = [...certsAll].sort((a, b) =>
    String(b.issued_at).localeCompare(String(a.issued_at)),
  );

  // Column set = every course the org actually uses (assigned or certified).
  const courseMap = new Map<string, MatrixCourse>();
  const noteCourse = (id: string) => {
    if (courseMap.has(id)) return;
    const c = courseOf(catalogue, id);
    courseMap.set(id, { id, title: c.title, topic: c.topic });
  };
  for (const e of enrolments) noteCourse(e.course_id);
  for (const c of certs) noteCourse(c.course_id);

  const courses = [...courseMap.values()].sort(
    (a, b) =>
      (a.topic ?? "").localeCompare(b.topic ?? "") ||
      a.title.localeCompare(b.title),
  );

  // Newest certificate per (user, course) — certs are ordered issued_at desc.
  const newestCert = new Map<string, { issued_at: string; expires_at: string | null }>();
  for (const c of certs ?? []) {
    const key = `${c.user_id}:${c.course_id}`;
    if (!newestCert.has(key)) {
      newestCert.set(key, { issued_at: c.issued_at, expires_at: c.expires_at });
    }
  }

  // Which courses each person actually has, so an empty cell can say why.
  const enrolmentStatus = new Map<string, string>();
  for (const e of enrolments ?? []) {
    enrolmentStatus.set(`${e.user_id}:${e.course_id}`, e.status as string);
  }

  // Leavers are kept for their training history but are not a compliance gap:
  // they were counted silently in the matrix with nothing to say they had
  // gone. Out by default, and labelled when asked for.
  const staff = (users ?? []).filter(
    (u) => options.includeLeavers || u.status !== "deactivated",
  );

  const rows: MatrixRow[] = staff.map((u) => {
    const cells: Record<string, string> = {};
    for (const course of courses) {
      cells[course.id] = cellText(
        newestCert.get(`${u.id}:${course.id}`),
        enrolmentStatus.get(`${u.id}:${course.id}`),
      );
    }
    return {
      name: u.full_name ?? u.email ?? "",
      email: u.email ?? "",
      status: u.status === "deactivated" ? "Left" : "Active",
      cells,
    };
  });

  return { courses, rows };
}

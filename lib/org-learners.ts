import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import {
  learnerStats,
  type Enrolment,
  type Certificate,
  type LearnerStats,
} from "@/lib/learner-stats";
import { formatDate } from "./dates";

export interface OrgLearnerRow {
  id: string;
  name: string;
  email: string | null;
  status: string;
  stats: LearnerStats;
  latestCompleted: { title: string; date: string } | null;
  lastAssignedAt: string | null;
  lastSeenAt: string | null;
  lastRemindedAt: string | null;
  /** Total in-course learning time, seconds (from enrolments.time_spent). */
  timeSpentSeconds: number;
  /** Certificates issued after the enrolment's due date. */
  lateCompletions: number;
}

/** Headline stats count active staff only; deactivated stay in the matrix. */
export const isActiveLearner = (r: OrgLearnerRow) => r.status !== "deactivated";

const DAY = 86_400_000;

/**
 * The two ways of being unseen, kept apart on purpose and defined ONCE here.
 *
 * "Inactive" means signed in at some point, then went quiet — someone to chase
 * about their training. "Never active" means invited but never onboarded at
 * all — someone to chase about signing in, which is a different conversation
 * (and a different email: they still have no password).
 *
 * These used to be spelled out at each call site and had drifted apart: the
 * org pages counted inactive as "has a last_seen_at AND it is stale" while the
 * platform org page counted "no last_seen_at OR it is stale", so one real org
 * showed 0 inactive to its manager and 223 to us under the same label. Import a
 * helper rather than re-deriving either test (issue #22).
 */
export const isInactive30d = (r: OrgLearnerRow, now: number = Date.now()) =>
  !!r.lastSeenAt && now - new Date(r.lastSeenAt).getTime() > 30 * DAY;

/** Invited but never signed in — no last_seen_at at all. */
export const isNeverActive = (r: OrgLearnerRow) => !r.lastSeenAt;

/**
 * A certificate counts as a late completion when it was issued after the
 * enrolment's due date. Both sides compare as YYYY-MM-DD strings (due_date is
 * a date; issued_at a timestamp). No due date = never late.
 */
export function isLateCompletion(
  issuedAt: string,
  dueDate: string | null | undefined,
): boolean {
  return !!dueDate && issuedAt.slice(0, 10) > dueDate;
}

/**
 * Every learner lands in exactly one status bucket, so status counts add up to
 * the learner total (issue #15). Most-urgent wins: overdue beats in-progress
 * beats not-started.
 */
export type LearnerBucket =
  | "overdue"
  | "in_progress"
  | "not_started"
  | "completed"
  | "unassigned";

export function bucketOf(r: OrgLearnerRow): LearnerBucket {
  const s = r.stats;
  if (s.assigned === 0) return "unassigned";
  if (s.overdue > 0) return "overdue";
  if (s.inProgress > 0) return "in_progress";
  if (s.notStarted > 0) return "not_started";
  return "completed";
}

/** One catalogue course, as the org pages name it. */
export interface CourseInfo {
  title: string;
  topic: string | null;
  estimatedMinutes: number | null;
}

/**
 * The course catalogue as a lookup, read once per page.
 *
 * Every org read used to embed `courses(title, topics(title))` on each
 * enrolment and certificate row — the same few dozen titles repeated once per
 * assignment, ~4,000 times on a fully assigned organisation (260 carers × 16
 * courses). One read of the catalogue and a Map does the same job for a
 * fraction of the bytes. Never selects content_blocks, which is the bulk of
 * the courses table.
 */
export async function loadCourseIndex(
  supabase: SupabaseClient,
): Promise<Map<string, CourseInfo>> {
  const { data } = await supabase
    .from("courses")
    .select("id, title, estimated_minutes, topics(title)");
  const index = new Map<string, CourseInfo>();
  for (const c of data ?? []) {
    const topic = c.topics as unknown as { title?: string } | null;
    index.set(c.id as string, {
      title: (c.title as string) ?? "Course",
      topic: topic?.title ?? null,
      estimatedMinutes: (c.estimated_minutes as number | null) ?? null,
    });
  }
  return index;
}

/** Title and topic for a course id, with the old join's fallbacks. */
export function courseOf(index: Map<string, CourseInfo>, id: string): CourseInfo {
  return index.get(id) ?? { title: "Course", topic: null, estimatedMinutes: null };
}

/** Anyone in the organisation, by id — for naming the rows of a list. */
export interface OrgPerson {
  full_name: string | null;
  email: string | null;
  status: string | null;
  role: string | null;
}

/**
 * Everyone in the organisation (every role), as a lookup by id. Replaces
 * `users(full_name, email)` embedded on every enrolment and certificate row:
 * one row per person instead of one per assignment.
 */
export async function loadOrgPeople(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<Map<string, OrgPerson>> {
  const rows = await fetchAll<OrgPerson & { id: string }>((f, t) => {
    let q = supabase.from("users").select("id, full_name, email, status, role");
    if (orgId) q = q.eq("organisation_id", orgId);
    return q.order("id").range(f, t);
  });
  return new Map(rows.map(({ id, ...p }) => [id, p]));
}

export interface OrgUserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string | null;
  last_seen_at: string | null;
}
export interface OrgEnrolmentRow {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
  progress: number;
  due_date: string | null;
  assigned_at: string;
  last_reminder_at: string | null;
  time_spent: number | null;
}
export interface OrgCertificateRaw {
  id: string;
  user_id: string;
  course_id: string;
  issued_at: string;
  expires_at: string | null;
}

/** The raw reads behind every org training figure, fetched once. */
export interface OrgTraining {
  users: OrgUserRow[];
  enrolments: OrgEnrolmentRow[];
  certificates: OrgCertificateRaw[];
  courses: Map<string, CourseInfo>;
}

/**
 * Every learner, enrolment and certificate in one organisation, plus the
 * course lookup. Split out of loadOrgLearners so a page that needs both the
 * per-learner rollup and a per-course one (Courses → Overview) reads the
 * enrolments once rather than twice.
 *
 * Pass orgId wherever it is known. RLS still decides what may be read, but
 * without the filter Postgres evaluates the policy on every row of the table
 * rather than walking the organisation_id index; and on the platform side
 * (service role, or a platform_admin) it is the only thing scoping the read.
 */
export async function loadOrgTraining(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<OrgTraining> {
  // Paged: Supabase silently returns at most 1,000 rows, and one organisation
  // of ~62 carers on 16 courses each is already past that — every figure on
  // the dashboard would be computed from a truncated list, with no error.
  // Pages are ordered by id so they don't overlap; the order the code below
  // relies on is restored afterwards.
  const [users, enrolments, certificates, courses] = await Promise.all([
    fetchAll<OrgUserRow>((f, t) => {
      let q = supabase
        .from("users")
        .select("id, full_name, email, status, last_seen_at")
        .eq("role", "learner");
      if (orgId) q = q.eq("organisation_id", orgId);
      return q.order("id").range(f, t);
    }),
    fetchAll<OrgEnrolmentRow>((f, t) => {
      let q = supabase
        .from("enrolments")
        .select(
          "id, user_id, course_id, status, progress, due_date, assigned_at, last_reminder_at, time_spent",
        );
      if (orgId) q = q.eq("organisation_id", orgId);
      return q.order("id").range(f, t);
    }),
    fetchAll<OrgCertificateRaw>((f, t) => {
      let q = supabase
        .from("certificates")
        .select("id, user_id, course_id, issued_at, expires_at");
      if (orgId) q = q.eq("organisation_id", orgId);
      return q.order("id").range(f, t);
    }),
    loadCourseIndex(supabase),
  ]);
  return { users, enrolments, certificates, courses };
}

/**
 * Aggregate every learner in the org for the Learners overview. One row per
 * learner with their full training rollup, latest completed course, when they
 * were last assigned training, and when they were last active on the site.
 * Pass orgId (see loadOrgTraining); without it RLS alone scopes the reads.
 */
export async function loadOrgLearners(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<OrgLearnerRow[]> {
  return buildOrgLearners(await loadOrgTraining(supabase, orgId));
}

/** The per-learner rollup, from reads already in hand. */
export function buildOrgLearners(data: OrgTraining): OrgLearnerRow[] {
  const { courses } = data;
  // Learners alphabetically; certificates newest first — "first seen is the
  // newest" below depends on it.
  // Blank names last, as Postgres's ascending order put them. Two people can
  // share a name (HG Care has two "Sharjeel Ahmed"s); the old query left their
  // order to chance, so it's settled by id here to keep lists stable.
  const users = [...data.users].sort((a, b) =>
    (a.full_name == null
      ? b.full_name == null ? 0 : 1
      : b.full_name == null ? -1 : String(a.full_name).localeCompare(String(b.full_name))) ||
    String(a.id).localeCompare(String(b.id)),
  );
  const certRaw = [...data.certificates].sort((a, b) =>
    String(b.issued_at).localeCompare(String(a.issued_at)),
  );

  // Group enrolments + certificates by learner.
  const enrByUser = new Map<string, Enrolment[]>();
  const assignedByUser = new Map<string, string>(); // latest assigned_at
  const remindedByUser = new Map<string, string>(); // latest last_reminder_at
  const timeByUser = new Map<string, number>(); // summed time_spent seconds
  const dueByUserCourse = new Map<string, string>(); // "user:course" → due_date
  for (const e of data.enrolments) {
    const c = courseOf(courses, e.course_id);
    const list = enrByUser.get(e.user_id) ?? [];
    list.push({
      id: `${e.user_id}:${e.course_id}`,
      course_id: e.course_id,
      status: e.status,
      progress: e.progress,
      due_date: e.due_date,
      assigned_at: e.assigned_at,
      attempt_count: 0,
      completion_count: 0,
      title: c.title,
      topic: c.topic,
    });
    enrByUser.set(e.user_id, list);
    const prev = assignedByUser.get(e.user_id);
    if (!prev || (e.assigned_at && e.assigned_at > prev)) {
      assignedByUser.set(e.user_id, e.assigned_at);
    }
    const prevReminded = remindedByUser.get(e.user_id);
    if (e.last_reminder_at && (!prevReminded || e.last_reminder_at > prevReminded)) {
      remindedByUser.set(e.user_id, e.last_reminder_at);
    }
    timeByUser.set(e.user_id, (timeByUser.get(e.user_id) ?? 0) + (e.time_spent ?? 0));
    if (e.due_date) dueByUserCourse.set(`${e.user_id}:${e.course_id}`, e.due_date);
  }

  const certByUser = new Map<string, Certificate[]>();
  const latestByUser = new Map<string, { title: string; date: string }>();
  const lateByUser = new Map<string, number>();
  for (const c of certRaw) {
    const co = courseOf(courses, c.course_id);
    const list = certByUser.get(c.user_id) ?? [];
    list.push({
      id: `${c.user_id}:${c.course_id}`,
      course_id: c.course_id,
      number: "",
      issued_at: c.issued_at,
      expires_at: c.expires_at,
      title: co.title,
      topic: co.topic,
    });
    certByUser.set(c.user_id, list);
    // certs are ordered issued_at desc, so the first seen is the newest.
    if (!latestByUser.has(c.user_id)) {
      latestByUser.set(c.user_id, {
        title: co.title,
        date: c.issued_at,
      });
    }
    if (isLateCompletion(c.issued_at, dueByUserCourse.get(`${c.user_id}:${c.course_id}`))) {
      lateByUser.set(c.user_id, (lateByUser.get(c.user_id) ?? 0) + 1);
    }
  }

  const now = new Date();
  return users.map((u) => {
    const enrolments = enrByUser.get(u.id) ?? [];
    const certificates = certByUser.get(u.id) ?? [];
    return {
      id: u.id,
      name: u.full_name ?? u.email ?? "Learner",
      email: u.email ?? null,
      status: u.status ?? "active",
      stats: learnerStats(enrolments, certificates, now),
      latestCompleted: latestByUser.get(u.id) ?? null,
      lastAssignedAt: assignedByUser.get(u.id) ?? null,
      lastSeenAt: u.last_seen_at ?? null,
      lastRemindedAt: remindedByUser.get(u.id) ?? null,
      timeSpentSeconds: timeByUser.get(u.id) ?? 0,
      lateCompletions: lateByUser.get(u.id) ?? 0,
    };
  });
}

export interface CoverageLearner {
  id: string;
  name: string;
  status: string; // enrolment status or 'not_enrolled'
  completedAt: string | null;
}
export interface CourseCoverage {
  course: { id: string; title: string } | null;
  completed: CoverageLearner[];
  outstanding: CoverageLearner[];
}

export interface WeekPoint {
  week: string; // short label, e.g. "21 Jul"
  count: number;
}

/**
 * Certificates issued per week over the last `weeks` weeks (oldest → newest).
 * Pass orgId to scope to one org (platform_admin); omit to rely on RLS.
 */
export async function completionsByWeek(
  supabase: SupabaseClient,
  weeks = 12,
  orgId?: string,
): Promise<WeekPoint[]> {
  const now = new Date();
  const msWeek = 7 * 86_400_000;
  const since = new Date(now.getTime() - weeks * msWeek).toISOString();
  // Across every organisation on the platform view, so it would be the first
  // chart to truncate — paged.
  const data = await fetchAll((f, t) => {
    let q = supabase.from("certificates").select("id, issued_at").gte("issued_at", since);
    if (orgId) q = q.eq("organisation_id", orgId);
    return q.order("id").range(f, t);
  });

  const buckets = new Array(weeks).fill(0);
  for (const c of data ?? []) {
    const age = now.getTime() - new Date(c.issued_at).getTime();
    const idx = weeks - 1 - Math.floor(age / msWeek);
    if (idx >= 0 && idx < weeks) buckets[idx] += 1;
  }
  return buckets.map((count, i) => {
    const d = new Date(now.getTime() - (weeks - 1 - i) * msWeek);
    return {
      week: formatDate(d, { day: "numeric", month: "short" }),
      count,
    };
  });
}

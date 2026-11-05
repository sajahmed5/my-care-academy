import { bucketOf, isInactive30d, isNeverActive, type OrgLearnerRow } from "./org-learners";
import { ukDaysAgo } from "./dates";

/**
 * The staff list (redesign, 1 Nov 2026, docs/redesign image 3): each row is
 * the training rollup plus the person's role, their job title, and where
 * their supervision and appraisal stand. Pure, shared by the page (server)
 * and the table (client), so the segments' counts and the rows agree.
 */

export interface CheckPill {
  label: string;
  tone: "danger" | "warn" | "ok" | "muted";
  /** Late (overdue or never) — counts towards "needs attention". */
  late: boolean;
  /** For sorting: 0 late … 3 fine. */
  order: number;
}

export interface StaffRow extends OrgLearnerRow {
  role?: string | null;
  jobTitle?: string | null;
  /** Null where the company's package has no supervisions. */
  supervision?: CheckPill | null;
  appraisal?: CheckPill | null;
}

export type Filter =
  | "all"
  | "attention"
  | "overdue"
  | "in_progress"
  | "not_started"
  | "completed"
  | "unassigned"
  | "deactivated"
  | "inactive"
  | "never"
  | "due_soon"
  | "signed_in";

export const FILTERS: Filter[] = ["all", "attention", "overdue", "in_progress", "not_started", "completed", "unassigned", "deactivated", "inactive", "never", "due_soon", "signed_in"];

/** The four segments across the top of the list. */
export const SEGMENTS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "never", label: "Never signed in" },
  { key: "deactivated", label: "Leavers" },
];

/** The rest, behind the Filters button. */
export const MORE_FILTERS: { key: Filter; label: string; group: string }[] = [
  { key: "overdue", label: "Overdue training", group: "Training" },
  { key: "due_soon", label: "Due in the next 60 days", group: "Training" },
  { key: "in_progress", label: "In progress", group: "Training" },
  { key: "not_started", label: "Not started", group: "Training" },
  { key: "completed", label: "Everything completed", group: "Training" },
  { key: "unassigned", label: "Nothing assigned", group: "Training" },
  { key: "signed_in", label: "Has signed in", group: "Activity" },
  { key: "inactive", label: "Not signed in for a month", group: "Activity" },
];

export function filterLabel(f: Filter): string {
  return SEGMENTS.find((s) => s.key === f)?.label ?? MORE_FILTERS.find((m) => m.key === f)?.label ?? "All";
}

/**
 * Someone a manager should look at: overdue training, a supervision or
 * appraisal that is late or never held, or an account never signed in to.
 * Leavers are never "attention" — there is nothing to chase.
 */
export function needsAttention(r: StaffRow): boolean {
  if (r.status === "deactivated") return false;
  return r.stats.overdue > 0 || !!r.supervision?.late || !!r.appraisal?.late || isNeverActive(r);
}

export function matches(r: StaffRow, f: Filter, now: number = Date.now()): boolean {
  // Deactivated accounts (leavers) are kept for their training history, but
  // they belong under All and Leavers only: surfacing a leaver as "overdue"
  // or "never signed in" invites someone to chase a person who can no longer
  // log in.
  if (r.status === "deactivated") return f === "all" || f === "deactivated";
  switch (f) {
    case "deactivated":
      return false;
    case "attention":
      return needsAttention(r);
    case "inactive":
      return isInactive30d(r, now);
    case "never":
      return isNeverActive(r);
    case "due_soon":
      return r.stats.dueSoon > 0;
    case "signed_in":
      return !isNeverActive(r);
    case "all":
      return true;
    default:
      return bucketOf(r) === f;
  }
}

/** Name or email contains the words typed. */
export function matchesQuery(r: StaffRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return r.name.toLowerCase().includes(needle) || (r.email ?? "").toLowerCase().includes(needle);
}

/** "Today", "Yesterday", "3 days ago", a date, or "Never signed in". */
export function lastActiveLabel(iso: string | null, now: number = Date.now(), fmt: (iso: string) => string): { label: string; stale: boolean } {
  if (!iso) return { label: "Never signed in", stale: true };
  const days = ukDaysAgo(iso, now);
  const stale = days > 30;
  if (days <= 0) return { label: "Today", stale };
  if (days === 1) return { label: "Yesterday", stale };
  if (days < 14) return { label: `${days} days ago`, stale };
  if (days < 30) return { label: `${Math.floor(days / 7)} weeks ago`, stale };
  return { label: fmt(iso), stale };
}

/** What the second line under a name says: their job title, else their role. */
export function roleLine(r: StaffRow): string {
  if (r.jobTitle) return r.jobTitle;
  switch (r.role) {
    case "org_admin":
      return "Manager";
    case "org_office":
      return "Office";
    case "learner":
      return "Care worker";
    default:
      return "";
  }
}

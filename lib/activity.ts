import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The audit trail, in plain English, for the people who caused it.
 *
 * Every sensitive action has been written to audit_logs since phase 10, and
 * org admins could already read their own organisation's rows under RLS — but
 * no page in the console ever showed them. A manager who deactivated the
 * wrong carer at 4pm, or can't remember whether she assigned the moving and
 * handling refresher, had nowhere to look (usability audit, 7 Oct 2026).
 */
export interface ActivityItem {
  id: string;
  at: string;
  /** Who did it — a name where we have one, otherwise their email. */
  who: string;
  /** One sentence, no system words. */
  text: string;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const n = (v: unknown): number | null => (typeof v === "number" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * One sentence per action. `subject` is the person the action was about,
 * when we could resolve a name for them.
 */
export function describe(row: AuditRow, subject: string | null): string {
  const who = subject ?? "a member of staff";
  const d = row.detail ?? {};
  switch (row.action) {
    case "user.invited":
      return `Invited ${str(d.email) ?? who}${str(d.role) === "org_admin" ? " as an admin" : ""}`;
    case "staff.bulk_invited": {
      const count = n(d.invited) ?? n(d.count);
      return count === null ? "Invited staff from a spreadsheet" : `Invited ${count} staff from a spreadsheet`;
    }
    case "staff.deactivated":
      return `Deactivated ${who}`;
    case "staff.reactivated":
      return `Reactivated ${who}`;
    case "staff.deleted":
      return `Deleted ${str(d.email) ?? who} and their training history`;
    case "training.assigned": {
      const courses = n(d.courses);
      const learners = n(d.learners);
      if (courses === null || learners === null) return "Assigned training";
      return `Assigned ${courses} ${courses === 1 ? "course" : "courses"} to ${learners} ${learners === 1 ? "carer" : "carers"}${str(d.dueDate) ? `, due ${str(d.dueDate)}` : ""}`;
    }
    case "training.bulk_assigned": {
      const count = n(d.assigned) ?? n(d.count);
      return count === null
        ? "Assigned training from a spreadsheet"
        : `Assigned ${count} ${count === 1 ? "course" : "courses"} from a spreadsheet`;
    }
    case "training.unassigned": {
      const removed = n(d.removed);
      if (removed !== null) {
        return `Unassigned ${removed} ${removed === 1 ? "course" : "courses"}`;
      }
      return `Unassigned ${str(d.course) ?? "a course"} from ${who}`;
    }
    case "training.due_date_changed": {
      const changed = n(d.changed);
      const to = str(d.dueDate);
      return `Moved the due date${to ? ` to ${to}` : ""} on ${changed ?? "some"} ${changed === 1 ? "assignment" : "assignments"}`;
    }
    case "issue_report.updated":
      return "Updated an issue report";
    case "candidate.hired":
      return `Hired ${str(d.name) ?? "a candidate"}`;
    default:
      // Never show a raw action key; say something true instead.
      return "Made a change";
  }
}

/**
 * The most recent things people did in this organisation. Pass orgId: RLS
 * already confines the read, but with the filter Postgres reads the newest
 * rows for one organisation off its index rather than walking the whole
 * table's history newest-first and testing the policy on each row.
 */
export async function loadRecentActivity(
  supabase: SupabaseClient,
  limit = 30,
  orgId?: string | null,
): Promise<ActivityItem[]> {
  let query = supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, actor_id, actor_email, detail, created_at");
  if (orgId) query = query.eq("organisation_id", orgId);
  const { data: rows } = await query
    .order("created_at", { ascending: false })
    .limit(limit);
  const audit = (rows ?? []) as AuditRow[];
  if (audit.length === 0) return [];

  // Resolve names for both the actor and the person acted on, in one read.
  const ids = new Set<string>();
  for (const r of audit) {
    if (r.actor_id) ids.add(r.actor_id);
    if (r.entity === "user" && r.entity_id) ids.add(r.entity_id);
  }
  const names = new Map<string, string>();
  if (ids.size > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", [...ids]);
    for (const u of users ?? []) {
      names.set(u.id as string, (u.full_name as string) || (u.email as string) || "Someone");
    }
  }

  return audit.map((r) => ({
    id: r.id,
    at: r.created_at,
    who: (r.actor_id && names.get(r.actor_id)) || r.actor_email || "Someone",
    text: describe(r, r.entity === "user" && r.entity_id ? (names.get(r.entity_id) ?? null) : null),
  }));
}

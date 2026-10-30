import { STAFF_ROLES } from "@/lib/roles";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasOutgrownBand } from "@/lib/organisations";

/** One organisation's platform-level engagement rollup. */
export interface OrgEngagementRow {
  id: string;
  name: string;
  tier: string;
  status: string; // active | suspended
  learners: number;
  assigned: number;
  completed: number;
  completionPct: number;
  overdue: number;
  /** Most recent learner activity on the site (max last_seen_at), or null. */
  lastActive: string | null;
  /** No learner active in the last 30 days (or never active). */
  dormant: boolean;
  /** The size band recorded against it, or null if none has been set. */
  sizeBand: string | null;
  /**
   * Current staff (leavers excluded) have grown past the recorded band — the
   * signal to look at its price. Nothing changes on its own.
   */
  outgrownBand: boolean;
  /** When its free trial ends, or null if it isn't on one (lib/trial.ts). */
  trialEndsAt: string | null;
  createdAt: string;
}

export interface PlatformEngagement {
  orgs: OrgEngagementRow[];
  totals: {
    orgs: number;
    activeOrgs: number; // not dormant, not suspended
    dormantOrgs: number;
    suspendedOrgs: number;
    /** Active organisations that have outgrown their recorded size band. */
    outgrownOrgs: number;
    learners: number;
    completions: number;
    completionPct: number;
  };
}

const DORMANT_DAYS = 30;

/** An embedded `table(count)` — PostgREST returns it as `[{ count }]`. */
const embeddedCount = (v: unknown): number =>
  (v as { count?: number }[] | null)?.[0]?.count ?? 0;

/**
 * Platform-wide engagement across every organisation, one row each.
 *
 * Every figure is counted by the database in a single request: the learner
 * and staff counts, assigned / overdue / completed, and the most recent
 * sign-in. It used to download every learner, enrolment and certificate on
 * the platform and tally them here — three whole tables on every visit to
 * the console, each silently cut off at 1,000 rows, so the numbers would have
 * stopped adding up long before anyone noticed.
 */
export async function loadOrgEngagement(
  supabase: SupabaseClient,
): Promise<PlatformEngagement> {
  const today = new Date().toISOString().slice(0, 10);
  const nowMs = new Date().getTime();
  const dormantCutoff = nowMs - DORMANT_DAYS * 86_400_000;

  // Each alias is its own embedded read, filtered on its own: the filters
  // narrow what is counted, never which organisations come back.
  const { data: orgs } = await supabase
    .from("organisations")
    .select(
      "id, name, package_tier, status, size_band, trial_ends_at, created_at, learners:users(count), staff:users(count), seen:users(last_seen_at), assigned:enrolments(count), overdue:enrolments(count), completed:certificates(count)",
    )
    .in("learners.role", STAFF_ROLES)
    // Bands are measured against current staff, as on the organisation's own
    // page — a leaver kept for their training history is not a seat.
    .in("staff.role", STAFF_ROLES)
    .neq("staff.status", "deactivated")
    // Most recent learner sign-in: the newest one only.
    .in("seen.role", STAFF_ROLES)
    .not("seen.last_seen_at", "is", null)
    .order("last_seen_at", { referencedTable: "seen", ascending: false })
    .limit(1, { referencedTable: "seen" })
    .neq("overdue.status", "completed")
    .lte("overdue.due_date", today)
    .order("name", { ascending: true });

  const rows: OrgEngagementRow[] = (orgs ?? []).map((o) => {
    const sizeBand = (o.size_band as string | null) ?? null;
    const asg = embeddedCount(o.assigned);
    const cmp = embeddedCount(o.completed);
    const seen = (o.seen as { last_seen_at: string }[] | null)?.[0]?.last_seen_at;
    const activeMs = seen ? new Date(seen).getTime() : null;
    return {
      id: o.id as string,
      name: o.name as string,
      tier: (o.package_tier as string | null) ?? "core",
      status: (o.status as string | null) ?? "active",
      learners: embeddedCount(o.learners),
      assigned: asg,
      completed: cmp,
      completionPct: asg > 0 ? Math.round((cmp / asg) * 100) : 0,
      overdue: embeddedCount(o.overdue),
      lastActive: activeMs ? new Date(activeMs).toISOString() : null,
      dormant: !activeMs || activeMs < dormantCutoff,
      sizeBand,
      outgrownBand: hasOutgrownBand(sizeBand, embeddedCount(o.staff)),
      trialEndsAt: (o.trial_ends_at as string | null) ?? null,
      createdAt: o.created_at as string,
    };
  });

  const totalAssigned = rows.reduce((n, r) => n + r.assigned, 0);
  const totalCompleted = rows.reduce((n, r) => n + r.completed, 0);
  return {
    orgs: rows,
    totals: {
      orgs: rows.length,
      activeOrgs: rows.filter((r) => r.status !== "suspended" && !r.dormant).length,
      dormantOrgs: rows.filter((r) => r.status !== "suspended" && r.dormant).length,
      suspendedOrgs: rows.filter((r) => r.status === "suspended").length,
      outgrownOrgs: rows.filter((r) => r.outgrownBand && r.status !== "suspended").length,
      learners: rows.reduce((n, r) => n + r.learners, 0),
      completions: totalCompleted,
      completionPct:
        totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0,
    },
  };
}

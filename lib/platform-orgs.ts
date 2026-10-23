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

/**
 * Platform-wide engagement across every organisation. A platform_admin's RLS
 * returns all orgs, so these reads span the whole platform; we group in memory.
 */
export async function loadOrgEngagement(
  supabase: SupabaseClient,
): Promise<PlatformEngagement> {
  const [{ data: orgs }, { data: users }, { data: enrolments }, { data: certs }] =
    await Promise.all([
      supabase
        .from("organisations")
        .select("id, name, package_tier, status, size_band, created_at")
        .order("name", { ascending: true }),
      supabase
        .from("users")
        .select("organisation_id, last_seen_at, status")
        .eq("role", "learner"),
      supabase.from("enrolments").select("organisation_id, status, due_date"),
      supabase.from("certificates").select("organisation_id"),
    ]);

  const today = new Date().toISOString().slice(0, 10);
  const nowMs = new Date().getTime();
  const dormantCutoff = nowMs - DORMANT_DAYS * 86_400_000;

  // Per-org accumulators.
  const learners = new Map<string, number>();
  // Bands are measured against current staff, as on the organisation's own
  // page — a leaver kept for their training history is not a seat.
  const currentStaff = new Map<string, number>();
  const lastActive = new Map<string, number>(); // ms
  for (const u of users ?? []) {
    learners.set(u.organisation_id, (learners.get(u.organisation_id) ?? 0) + 1);
    if (u.status !== "deactivated") {
      currentStaff.set(u.organisation_id, (currentStaff.get(u.organisation_id) ?? 0) + 1);
    }
    if (u.last_seen_at) {
      const t = new Date(u.last_seen_at).getTime();
      if (t > (lastActive.get(u.organisation_id) ?? 0)) {
        lastActive.set(u.organisation_id, t);
      }
    }
  }

  const assigned = new Map<string, number>();
  const overdue = new Map<string, number>();
  for (const e of enrolments ?? []) {
    assigned.set(e.organisation_id, (assigned.get(e.organisation_id) ?? 0) + 1);
    if (e.due_date && e.status !== "completed" && e.due_date <= today) {
      overdue.set(e.organisation_id, (overdue.get(e.organisation_id) ?? 0) + 1);
    }
  }

  const completed = new Map<string, number>();
  for (const c of certs ?? []) {
    completed.set(c.organisation_id, (completed.get(c.organisation_id) ?? 0) + 1);
  }

  const rows: OrgEngagementRow[] = (orgs ?? []).map((o) => {
    const sizeBand = (o.size_band as string | null) ?? null;
    const asg = assigned.get(o.id) ?? 0;
    const cmp = completed.get(o.id) ?? 0;
    const activeMs = lastActive.get(o.id) ?? null;
    return {
      id: o.id,
      name: o.name,
      tier: o.package_tier ?? "core",
      status: o.status ?? "active",
      learners: learners.get(o.id) ?? 0,
      assigned: asg,
      completed: cmp,
      completionPct: asg > 0 ? Math.round((cmp / asg) * 100) : 0,
      overdue: overdue.get(o.id) ?? 0,
      lastActive: activeMs ? new Date(activeMs).toISOString() : null,
      dormant: !activeMs || activeMs < dormantCutoff,
      sizeBand,
      outgrownBand: hasOutgrownBand(sizeBand, currentStaff.get(o.id) ?? 0),
      createdAt: o.created_at,
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

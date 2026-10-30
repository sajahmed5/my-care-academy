/**
 * What the staff file and training audits find, read now under RLS. Paged
 * past 1,000 rows.
 *
 * Probation: today a probation review is a supervision of kind "probation"
 * (lib/supervisions). When the HR pack keeps probation in its own table,
 * read it here instead — this is the only place that knows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STAFF_ROLES } from "./roles";
import { fetchAll } from "./fetch-all";
import { isActiveLearner, loadOrgLearners } from "./org-learners";
import type { StaffDoc } from "./staff-documents";
import { buildStaffFileSnapshot, buildTrainingSnapshot, type AutoKind, type AutoSnapshot } from "./auto-audits";

export async function loadAutoSnapshot(supabase: SupabaseClient, organisationId: string, kind: AutoKind, now = new Date()): Promise<AutoSnapshot> {
  if (kind === "training") {
    const learners = (await loadOrgLearners(supabase, organisationId)).filter(isActiveLearner);
    return buildTrainingSnapshot(
      learners.map((l) => ({
        id: l.id,
        name: l.name,
        assigned: l.stats.assigned,
        completed: l.stats.completed,
        overdue: l.stats.overdue,
        expired: l.stats.expired,
      })),
    );
  }
  const [people, docs, probations] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from("users")
        .select("id, full_name, email, created_at")
        .eq("organisation_id", organisationId)
        .in("role", STAFF_ROLES)
        .eq("status", "active")
        .order("id")
        .range(f, t),
    ),
    fetchAll<StaffDoc & { user_id: string }>((f, t) =>
      supabase
        .from("staff_documents")
        .select("id, user_id, doc_type, file_name, file_path, expires_at, not_required, not_required_reason")
        .eq("organisation_id", organisationId)
        .order("id")
        .range(f, t),
    ),
    fetchAll<{ user_id: string; held_on: string }>((f, t) =>
      supabase
        .from("supervisions")
        .select("id, user_id, held_on")
        .eq("organisation_id", organisationId)
        .eq("kind", "probation")
        .order("id")
        .range(f, t),
    ),
  ]);
  return buildStaffFileSnapshot(
    people
      .map((p) => ({
        id: p.id as string,
        name: (p.full_name as string | null) || (p.email as string) || "Unnamed",
        joinedOn: String(p.created_at).slice(0, 10),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    docs,
    probations,
    now,
  );
}

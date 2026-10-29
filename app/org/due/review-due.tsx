import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { buildDueRows } from "@/lib/due-view";
import { DueList } from "./due-list";
import { loadCurrentCarers } from "./load";

/**
 * Who is due a supervision, or an appraisal, across the organisation. The two
 * fall due on their own (every 3 and 12 months by default), so each has its
 * own list. Office staff are on both (STAFF-AUDITS.md, 29 Oct 2026), and a
 * booked date shows beside the due date.
 */
export async function ReviewDuePage({ kind }: { kind: "supervision" | "appraisal" }) {
  const context = await requireConsole();
  await requireFeature(context, "people.supervisions");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [people, records, bookings] = await Promise.all([
    loadCurrentCarers(supabase, orgId, { withOffice: true }),
    fetchAll((f, t) =>
      supabase
        .from("supervisions")
        .select("id, user_id, held_on, next_due")
        .eq("organisation_id", orgId)
        .eq("kind", kind)
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) =>
      supabase
        .from("staff_audit_bookings")
        .select("id, user_id, booked_on")
        .eq("organisation_id", orgId)
        .eq("kind", kind)
        .eq("status", "booked")
        .order("id")
        .range(f, t),
    ),
  ]);
  const rows = buildDueRows(
    people,
    records.map((r) => ({ userId: r.user_id as string, heldOn: r.held_on as string, nextDue: (r.next_due as string | null) ?? null })),
    new Date(),
    bookings.map((b) => ({ userId: b.user_id as string, on: b.booked_on as string })),
  );
  const noun = kind === "appraisal" ? "appraisal" : "supervision";
  return (
    <DashboardShell title={kind === "appraisal" ? "Appraisals due" : "Supervisions due"} context={context}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Every current member of staff — carers and office — and when their next {noun} falls. Open someone to book or hold one.
        </p>
        <DueList rows={rows} section="supervisions" noun={noun} />
      </div>
    </DashboardShell>
  );
}

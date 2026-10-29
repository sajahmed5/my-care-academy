import { isStaff } from "@/lib/roles";
import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadStaffOptions } from "@/lib/complaints/data";
import { PlanForm } from "../plan-form";

/**
 * Start a plan. Reached from a carer's file (`?from=spot_check:<id>`, a
 * supervision or a competency), from a complaint, or from the list.
 */
export default async function NewPipPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; complaint?: string; from?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "people.performance_plans");
  const { user, complaint, from } = await searchParams;
  const [fromType, fromId] = (from ?? "").split(":");
  const raisedFrom =
    ["supervision", "spot_check", "competency"].includes(fromType) && /^[0-9a-f-]{36}$/.test(fromId ?? "")
      ? { type: fromType, id: fromId }
      : null;
  const supabase = await createClient();
  const [allStaff, { data: ref }] = await Promise.all([
    loadStaffOptions(supabase, context.organisationId),
    complaint
      ? supabase.from("complaints").select("reference").eq("id", complaint).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const staff = allStaff.filter((s) => isStaff(s.role));

  return (
    <DashboardShell title="Start a performance plan" context={context}>
      <div className="space-y-6">
        <Link
          href={
            complaint
              ? `/org/complaints/${complaint}`
              : raisedFrom && user
                ? `/org/staff/${user}?section=${raisedFrom.type === "supervision" ? "supervisions" : "competency"}`
                : "/org/pips"
          }
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back
        </Link>
        <PlanForm
          staff={staff}
          initialUserId={user ?? null}
          complaintId={ref ? complaint ?? null : null}
          complaintReference={ref?.reference ?? null}
          raisedFrom={raisedFrom}
        />
      </div>
    </DashboardShell>
  );
}

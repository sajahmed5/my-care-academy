import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadStaffOptions } from "@/lib/complaints/data";
import { PlanForm } from "../plan-form";

/**
 * Start a plan. Reached from a complaint (with the staff member and the record
 * filled in) or from the list.
 */
export default async function NewPipPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; complaint?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");
  const { user, complaint } = await searchParams;
  const supabase = await createClient();
  const [allStaff, { data: ref }] = await Promise.all([
    loadStaffOptions(supabase, context.organisationId),
    complaint
      ? supabase.from("complaints").select("reference").eq("id", complaint).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const staff = allStaff.filter((s) => s.role === "learner");

  return (
    <DashboardShell title="Start a performance plan" context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={complaint ? `/org/complaints/${complaint}` : "/org/pips"} className="text-sm text-muted-foreground hover:underline">
          ← Back
        </Link>
        <PlanForm
          staff={staff}
          initialUserId={user ?? null}
          complaintId={ref ? complaint ?? null : null}
          complaintReference={ref?.reference ?? null}
        />
      </div>
    </DashboardShell>
  );
}

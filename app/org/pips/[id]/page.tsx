import { isStaff } from "@/lib/roles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { loadPip } from "@/lib/pips/data";
import { pipSteps } from "@/lib/pips/steps";
import { loadStaffOptions } from "@/lib/complaints/data";
import { PipView } from "./pip-view";

export const dynamic = "force-dynamic";

const RAISED_FROM: Record<string, string> = {
  supervision: "a supervision",
  spot_check: "a spot check",
  competency: "a competency assessment",
};

export default async function PipPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "people.performance_plans");
  const { id } = await params;
  const supabase = await createClient();
  const [pip, staff] = await Promise.all([loadPip(supabase, id), loadStaffOptions(supabase, context.organisationId)]);
  if (!pip) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const { steps, next } = pipSteps(pip, today);

  return (
    <DashboardShell title={`${pip.carerName} — ${pip.kind === "disciplinary" ? "disciplinary" : "performance plan"}`} context={context}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/org/pips" className="text-muted-foreground hover:underline">← All plans</Link>
            {pip.raisedFromType && (
              <Link
                href={`/org/staff/${pip.userId}?section=${pip.raisedFromType === "supervision" ? "supervisions" : "competency"}`}
                className="text-primary hover:underline"
              >
                Raised from {RAISED_FROM[pip.raisedFromType] ?? "their file"} →
              </Link>
            )}
          </span>
          <a href={`/org/pips/${pip.id}/pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FileDown className="size-4" /> Plan PDF
          </a>
        </div>
        <PipView pip={pip} steps={steps} next={next} staff={staff.filter((s) => isStaff(s.role))} today={today} />
      </div>
    </DashboardShell>
  );
}

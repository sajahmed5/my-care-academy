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

export default async function PipPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");
  const { id } = await params;
  const supabase = await createClient();
  const [pip, staff] = await Promise.all([loadPip(supabase, id), loadStaffOptions(supabase, context.organisationId)]);
  if (!pip) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const { steps, next } = pipSteps(pip, today);

  return (
    <DashboardShell title={`${pip.carerName} — ${pip.kind === "disciplinary" ? "disciplinary" : "performance plan"}`} context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/org/pips" className="text-sm text-muted-foreground hover:underline">← All plans</Link>
          <a href={`/org/pips/${pip.id}/pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FileDown className="size-4" /> Plan PDF
          </a>
        </div>
        <PipView pip={pip} steps={steps} next={next} staff={staff.filter((s) => s.role === "learner")} today={today} />
      </div>
    </DashboardShell>
  );
}

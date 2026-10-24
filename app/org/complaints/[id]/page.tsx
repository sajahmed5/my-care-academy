import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { loadComplaint, loadStages, loadStaffOptions } from "@/lib/complaints/data";
import { stagesFor } from "@/lib/complaints/stages";
import { buildSteps, nextStep } from "@/lib/complaints/steps";
import { closeGaps, closeGapsMessage } from "@/lib/complaints/close";
import { isTriageStage } from "@/lib/complaints/compute";
import { ComplaintProcess } from "./process";

export const dynamic = "force-dynamic";

/**
 * One complaint: the seven steps down the side, the next thing to do at the
 * top, and each stage openable as a form, a letter or a box of documents.
 */
export default async function ComplaintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");
  const { id } = await params;
  const { stage: openStage } = await searchParams;

  const supabase = await createClient();
  const [complaint, allStages, staff, { data: org }] = await Promise.all([
    loadComplaint(supabase, id),
    loadStages(supabase, context.organisationId),
    loadStaffOptions(supabase, context.organisationId),
    supabase.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(),
  ]);
  if (!complaint) notFound();

  const stages = stagesFor(allStages, complaint.kind);
  const closed = complaint.status !== "open";
  const today = new Date().toISOString().slice(0, 10);
  const triageTitles = complaint.actions.filter((a) => a.stageTag === "meeting:1").map((a) => a.title);
  const steps = buildSteps(stages, complaint.stageEntries, closed);
  const next = nextStep(
    steps,
    complaint.stageEntries,
    { reportedOn: complaint.reportedOn, completeBy: complaint.completeBy, closed },
    today,
    triageTitles,
  );

  const triage = stages.find(isTriageStage);
  const triaged = !triage || complaint.stageEntries.some((e) => e.stageId === triage.id && e.status !== "pending");
  const closeMessage = closeGapsMessage(closeGaps(stages, complaint.stageEntries), !triaged, {
    openActions: complaint.actions.filter((a) => !a.completedAt).map((a) => `${a.title}${a.ownerName ? ` — ${a.ownerName}` : ""}`),
    openPlans: complaint.pips
      .filter((p) => p.status === "open")
      .map((p) => `${p.kind === "disciplinary" ? "Disciplinary" : "Performance plan"} for ${p.carerName}`),
  });

  return (
    <DashboardShell title={complaint.reference} context={context}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/org/complaints" className="text-sm text-muted-foreground hover:underline">
            ← All complaints
          </Link>
          <a
            href={`/org/complaints/${complaint.id}/pdf`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FileDown className="size-4" />
            Response PDF
          </a>
        </div>

        <ComplaintProcess
          complaint={complaint}
          stages={stages}
          steps={steps}
          next={next}
          closeMessage={closeMessage}
          staff={staff}
          organisationName={org?.name ?? "Our organisation"}
          senderName={context.email}
          today={today}
          initialStageId={openStage ?? null}
        />
      </div>
    </DashboardShell>
  );
}

import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { loadComplaint, loadStages, loadStaffOptions } from "@/lib/complaints/data";
import { isUntriaged, stagesFor } from "@/lib/complaints/stages";
import { suggestionsFor } from "@/lib/complaints/categories";
import { loadConcernTraining } from "@/lib/complaints/person";
import { readConfirmations, remindersFor } from "@/lib/complaints/reminders";
import { findReadinessGaps } from "@/lib/complaints/readiness";
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
  const orgId = context.organisationId!;
  const [complaint, allStages, staff, { data: org }, clients] = await Promise.all([
    loadComplaint(supabase, id),
    loadStages(supabase, context.organisationId),
    loadStaffOptions(supabase, context.organisationId),
    supabase.from("organisations").select("name").eq("id", orgId).maybeSingle(),
    // Null when the client list is not in their package: the picker is not offered.
    hasFeature(context, "clients.list").then(async (on) => {
      if (!on) return null;
      const { data } = await supabase
        .from("clients")
        .select("id, full_name, status")
        .eq("organisation_id", orgId)
        .order("full_name")
        .limit(1000);
      return (data ?? []).map((c) => ({ id: c.id as string, name: `${c.full_name as string}${c.status === "ended" ? " (ended)" : ""}` }));
    }),
  ]);
  if (!complaint) notFound();
  // Raised from a client QA (Service audits): the link back. RLS returns none without the package.
  const { data: fromQa } = await supabase.from("client_qas").select("id, held_on").eq("complaint_id", complaint.id).limit(1).maybeSingle();

  // The training an accident's or near miss's category suggests, for each
  // member of staff named on it, shown under its actions.
  const training: { userId: string; name: string | null; suggestions: ReturnType<typeof suggestionsFor> }[] = [];
  if (["accident", "near_miss"].includes(complaint.kind) && complaint.category && complaint.people.length) {
    const [{ data: courseRows }, assigned] = await Promise.all([
      supabase.from("courses").select("id, slug, title").order("title"),
      loadConcernTraining(supabase, [complaint.id]),
    ]);
    const catalogue = (courseRows ?? []).map((c) => ({ id: c.id as string, slug: c.slug as string, title: c.title as string }));
    for (const p of complaint.people) {
      training.push({
        userId: p.user_id,
        name: p.name,
        suggestions: suggestionsFor({
          category: complaint.category,
          courses: catalogue,
          assigned: assigned.get(`${complaint.id}:${p.user_id}`) ?? new Map(),
        }),
      });
    }
  }

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

  // "3 concerns about this client this year", this one included.
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const clientConcerns = complaint.client
    ? ((
        await supabase
          .from("complaints")
          .select("id", { count: "exact", head: true })
          .eq("client_id", complaint.client.id)
          .gte("reported_on", yearStart)
      ).count ?? 0)
    : 0;

  // The legal reminders read the answers by stage kind, not by stage id.
  const byKind: Record<string, Record<string, unknown>> = {};
  for (const st of stages) {
    const e = complaint.stageEntries.find((x) => x.stageId === st.id);
    if (e) byKind[st.kind] = e.formAnswers;
  }
  const council = complaint.client?.funderType === "council" ? complaint.client.funderName : null;
  const reminders = remindersFor(complaint.kind, byKind, readConfirmations(complaint.reminders), { council });

  // What is still missing before the response goes: shown on the Outcome
  // Letter while it has not been sent.
  const readiness = findReadinessGaps(complaint, stages);

  const triage = stages.find(isTriageStage);
  const triaged = !isUntriaged(complaint.kind) && (!triage || complaint.stageEntries.some((e) => e.stageId === triage.id && e.status !== "pending"));
  const closeMessage = closeGapsMessage(closeGaps(stages, complaint.stageEntries), !triaged, {
    openActions: complaint.actions.filter((a) => !a.completedAt).map((a) => `${a.title}${a.ownerName ? ` — ${a.ownerName}` : ""}`),
    openPlans: complaint.pips
      .filter((p) => p.status === "open")
      .map((p) => `${p.kind === "disciplinary" ? "Disciplinary" : "Performance plan"} for ${p.carerName}`),
  });

  return (
    <DashboardShell title={complaint.reference} context={context}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/org/complaints" className="text-sm text-muted-foreground hover:underline">
            ← Complaints & safeguarding
          </Link>
          <a
            href={`/org/complaints/${complaint.id}/pdf`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FileDown className="size-4" />
            {complaint.kind === "complaint" ? "Response PDF" : "Record PDF"}
          </a>
        </div>
        {fromQa && (
          <p className="text-sm text-muted-foreground">
            Raised from the{" "}
            <Link href={`/org/audits/qa/${fromQa.id}`} className="underline">
              client QA on {formatDate(fromQa.held_on as string, { day: "numeric", month: "long", year: "numeric" })}
            </Link>
            .
          </p>
        )}

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
          clients={clients}
          training={training}
          reminders={reminders}
          clientConcerns={clientConcerns}
          readiness={readiness}
        />
      </div>
    </DashboardShell>
  );
}

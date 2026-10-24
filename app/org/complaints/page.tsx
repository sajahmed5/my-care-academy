import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/learner-ui";
import { AlertTriangle, Clock, FolderOpen, Settings2 } from "lucide-react";
import { loadComplaintList, loadStages, loadStaffOptions } from "@/lib/complaints/data";
import { stagesFor } from "@/lib/complaints/stages";
import { buildSteps, nextStep } from "@/lib/complaints/steps";
import { NewComplaint } from "./new-complaint";
import { ComplaintRow } from "./complaint-row";
import { SeedStages } from "./seed-stages";

/**
 * The complaints list: every record, what it is, and the next thing to do on
 * it. The counts an inspector opens with sit at the top — how many are open,
 * how many have a response running late.
 */
export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");
  const { status, kind } = await searchParams;

  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [{ complaints, entries }, stages, staff] = await Promise.all([
    loadComplaintList(supabase, orgId),
    loadStages(supabase, orgId),
    loadStaffOptions(supabase, orgId),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const rows = complaints.map((c) => {
    const mine = stagesFor(stages, c.kind);
    const es = entries.get(c.id) ?? [];
    const closed = c.status !== "open";
    const steps = buildSteps(mine, es, closed);
    const next = c.status === "open"
      ? nextStep(steps, es, { reportedOn: c.reportedOn, completeBy: c.completeBy, closed: false }, today)
      : { text: `${c.status === "closed" ? "Closed" : c.status === "withdrawn" ? "Withdrawn" : "Cancelled"}${c.closedOn ? ` on ${c.closedOn}` : ""}.` };
    const current = steps.find((s) => s.state === "current");
    return { complaint: c, next, stepLabel: current ? `${current.n} of ${steps.length} · ${current.title}` : null };
  });

  const open = rows.filter((r) => r.complaint.status === "open");
  const late = open.filter((r) => r.next.late).length;
  const shown = rows.filter(
    (r) => (!status || r.complaint.status === status) && (!kind || r.complaint.kind === kind),
  );

  return (
    <DashboardShell title="Complaints" context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/org" className="text-sm text-muted-foreground hover:underline">
            ← Back to console
          </Link>
          <div className="flex gap-2">
            <Link href="/org/pips" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Performance plans
            </Link>
            <Link href="/org/complaints/stages" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <Settings2 className="size-4" />
              The process
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatTile label="All" value={complaints.length} icon={FolderOpen} color="#6366f1" href="/org/complaints" hint={status ? "Show all" : "Showing all"} />
          <StatTile label="Open" value={open.length} icon={Clock} color="#f59e0b" href="/org/complaints?status=open" hint={status === "open" ? "Showing these" : undefined} />
          <StatTile label="Running late" value={late} icon={AlertTriangle} color="#ef4444" hint="Acknowledgement or response past its date" />
        </div>

        {stages.length === 0 ? (
          <SeedStages />
        ) : (
          <NewComplaint staff={staff.filter((s) => s.role === "learner")} />
        )}

        {shown.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {complaints.length === 0
                ? "Nothing recorded yet. A complaint, a safeguarding concern or an issue all start here."
                : "Nothing matches that filter."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {shown.map((r) => (
              <ComplaintRow key={r.complaint.id} complaint={r.complaint} next={r.next} stepLabel={r.stepLabel} />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

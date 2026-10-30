import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site-url";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/learner-ui";
import { AlertTriangle, BarChart3, Clock, FolderOpen, Heart, Inbox, Plus } from "lucide-react";
import { loadComplaintList, loadStages } from "@/lib/complaints/data";
import { COMPLAINT_KINDS, UNTRIAGED, isUntriaged, stagesFor } from "@/lib/complaints/stages";
import { buildSteps, nextStep } from "@/lib/complaints/steps";
import { ComplaintRow } from "./complaint-row";
import { SeedStages } from "./seed-stages";
import { CopyConcernLink } from "./copy-concern-link";

/**
 * The one front door (COMPLAINTS-SAFEGUARDING.md): every concern, whatever it
 * turned out to be, with the next thing to do on it. What is waiting for
 * triage comes first, then the counts an inspector opens with — how many are
 * open, how many have a response running late.
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
  const [{ complaints, entries }, stages, { data: link }, origin] = await Promise.all([
    loadComplaintList(supabase, orgId),
    loadStages(supabase, orgId),
    supabase.from("concern_links").select("token, is_open").eq("organisation_id", orgId).maybeSingle(),
    siteOrigin(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const rows = complaints.map((c) => {
    const mine = stagesFor(stages, c.kind);
    const es = entries.get(c.id) ?? [];
    const closed = c.status !== "open";
    const steps = buildSteps(mine, es, closed);
    const next = c.status !== "open"
      ? { text: `${c.status === "closed" ? "Closed" : c.status === "withdrawn" ? "Withdrawn" : "Cancelled"}${c.closedOn ? ` on ${c.closedOn}` : ""}.` }
      : isUntriaged(c.kind)
        ? { text: "Decide what this is." }
        : nextStep(steps, es, { reportedOn: c.reportedOn, completeBy: c.completeBy, closed: false }, today);
    const current = steps.find((s) => s.state === "current");
    return { complaint: c, next, stepLabel: current && !isUntriaged(c.kind) ? `${current.n} of ${steps.length} · ${current.title}` : null };
  });

  const open = rows.filter((r) => r.complaint.status === "open");
  const late = open.filter((r) => r.next.late).length;
  const waiting = open.filter((r) => isUntriaged(r.complaint.kind)).length;
  const href = (q: { status?: string; kind?: string }) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();
    return `/org/complaints${p ? `?${p}` : ""}`;
  };
  const shown = rows.filter(
    (r) => (!status || r.complaint.status === status) && (!kind || r.complaint.kind === kind),
  );

  return (
    <DashboardShell title="Complaints & safeguarding" context={context}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {stages.length > 0 && (
            <Link href="/org/complaints/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-4" />
              Raise a concern
            </Link>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Link href="/org/complaints/trends" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <BarChart3 className="size-4" />
              Trends
            </Link>
            <Link href="/org/complaints/compliments" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <Heart className="size-4" />
              Compliments
            </Link>
            {/* The link and the process themselves are set under Settings, by a manager. */}
            {link?.is_open && <CopyConcernLink url={`${origin}/concern/${link.token}`} />}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Waiting to be looked at" value={waiting} icon={Inbox} color="#8b5cf6" href={href({ status: "open", kind: UNTRIAGED })} hint={kind === UNTRIAGED ? "Showing these" : undefined} />
          <StatTile label="Open" value={open.length} icon={Clock} color="#f59e0b" href={href({ status: "open", kind })} hint={status === "open" ? "Showing these" : undefined} />
          <StatTile label="Running late" value={late} icon={AlertTriangle} color="#ef4444" hint="Acknowledgement or response past its date" />
          <StatTile label="All" value={complaints.length} icon={FolderOpen} color="#6366f1" href="/org/complaints" hint={status || kind ? "Show all" : "Showing all"} />
        </div>

        {/* By type: each has its own process, and the list reads best one at a time. */}
        <nav className="flex flex-wrap gap-2 text-sm">
          {[{ value: "", plural: "Everything" }, ...COMPLAINT_KINDS].map((k) => {
            const on = (kind ?? "") === k.value;
            return (
              <Link
                key={k.value || "all"}
                href={href({ status, kind: k.value })}
                className={`rounded-full border px-3 py-1 ${on ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "bg-background text-muted-foreground hover:text-foreground"}`}
              >
                {k.plural}
              </Link>
            );
          })}
        </nav>

        {stages.length === 0 &&
          (context.role === "org_admin" ? (
            <SeedStages />
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Your manager needs to set up the complaints process in Settings first.
              </CardContent>
            </Card>
          ))}

        {shown.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {complaints.length === 0
                ? "Nothing raised yet. Complaints, safeguarding concerns, issues, accidents and near misses all start here."
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

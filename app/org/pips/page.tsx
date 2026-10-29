import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/learner-ui";
import { AlertTriangle, ClipboardList, Plus } from "lucide-react";
import { loadPips } from "@/lib/pips/data";
import { pipSteps } from "@/lib/pips/steps";
import { PIP_KINDS, label } from "@/lib/pips/plan";
import { fmtDate } from "../complaints/complaint-row";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-muted text-muted-foreground",
};

/** Every plan, with where it has got to and what is owed next. */
export default async function PipsPage() {
  const context = await requireConsole();
  await requireFeature(context, "people.performance_plans");
  const supabase = await createClient();
  const [pips, withComplaints] = await Promise.all([
    loadPips(supabase, context.organisationId),
    hasFeature(context, "complaints.register"),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const rows = pips.map((p) => ({ pip: p, ...pipSteps(p, today) }));
  const open = rows.filter((r) => r.pip.status === "open");
  const late = open.filter((r) => r.next.late).length;

  return (
    <DashboardShell title="Performance plans" context={context}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Raised from a supervision, spot check or competency that wasn&apos;t met
            {withComplaints ? ", or from a complaint" : ""}.
          </p>
          <Link href="/org/pips/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Plus className="size-4" /> Start a plan
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatTile label="All" value={pips.length} icon={ClipboardList} color="#6366f1" />
          <StatTile label="Running" value={open.length} icon={ClipboardList} color="#f59e0b" />
          <StatTile label="Review overdue" value={late} icon={AlertTriangle} color="#ef4444" hint="A week ended and was not reviewed" />
        </div>

        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No plans yet. Raise one from a carer&apos;s file — a supervision, or a spot check or competency that wasn&apos;t met.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map(({ pip, steps, next }) => {
              const current = steps.find((s) => s.state === "current");
              return (
                <Link key={pip.id} href={`/org/pips/${pip.id}`} className="block">
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="space-y-2 pt-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {pip.carerName}{" "}
                          <span className="text-xs font-normal text-muted-foreground">· {label(PIP_KINDS, pip.kind)}</span>
                        </p>
                        <div className="flex items-center gap-2 text-xs">
                          {current && <span className="text-muted-foreground">{current.n} of 4 · {current.title}</span>}
                          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[pip.status] ?? ""}`}>{pip.status}</span>
                        </div>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{pip.reason}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {pip.startDate ? `From ${fmtDate(pip.startDate)}` : ""}
                          {pip.reviewUntil ? ` to ${fmtDate(pip.reviewUntil)}` : ""}
                          {pip.complaintReference ? ` · from ${pip.complaintReference}` : ""}
                        </span>
                        <span className={next.late ? "font-medium text-rose-600" : ""}>{next.text}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

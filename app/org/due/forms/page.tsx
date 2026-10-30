import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { DueTabs } from "../due-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { reviewHref, reviewRows, type ReviewRow } from "@/lib/form-reviews";
import { loadReviewRecords } from "@/lib/form-reviews-data";
import { formatDate } from "@/lib/dates";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

const GROUPS: { status: ReviewRow["status"]; label: string; chip: string }[] = [
  { status: "overdue", label: "Overdue", chip: "bg-rose-100 text-rose-700" },
  { status: "due_soon", label: "Due in the next 30 days", chip: "bg-amber-100 text-amber-700" },
  { status: "scheduled", label: "Due later", chip: "bg-muted text-muted-foreground" },
];

/**
 * Forms due for review (FORMS.md): the latest risk assessment, care plan or
 * business continuity plan of each kind, for each client, carer and the
 * company, when its review date comes round. Reviewing a client or company
 * form opens it again from the last answers; a carer form is asked again.
 */
export default async function FormReviewsDuePage() {
  const context = await requireConsole();
  await requireFeature(context, "forms.builder");
  const supabase = await createClient();
  const orgId = context.organisationId!;

  const due = reviewRows(await loadReviewRecords(supabase, orgId), new Date());

  return (
    <DashboardShell title="Who's due" context={context}>
      <div className="space-y-6">
        <DueTabs context={context} active="/org/due/forms" />
        <p className="text-sm text-muted-foreground">
          The latest of each form that is reviewed — risk assessments, care plans, the business continuity plan — and when its review falls.
          Reviewing opens the form again with its last answers, to change what has changed and sign again.
        </p>
        {due.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing with a review date yet. Forms that need reviewing get one when they are filled in.
            </CardContent>
          </Card>
        ) : (
          GROUPS.map((g) => {
            const group = due.filter((r) => r.status === g.status);
            if (!group.length) return null;
            return (
              <section key={g.status} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {g.label} ({group.length})
                </h3>
                <Card>
                  <CardContent className="divide-y p-0">
                    {group.map((r) => (
                      <Link
                        key={r.id}
                        href={reviewHref(r)}
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-primary">{r.templateTitle}</span>
                          <span className="block text-xs text-muted-foreground">
                            {r.subject === "client" ? r.clientName : r.subject === "carer" ? r.userName : "The company"} · last done {fmt(r.submittedAt)}
                          </span>
                        </span>
                        <span className="flex items-center gap-3 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${g.chip}`}>Review by {fmt(r.reviewDue!)}</span>
                          <span className="text-muted-foreground">{r.subject === "carer" ? "Ask again" : "Review"}</span>
                          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                        </span>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              </section>
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}

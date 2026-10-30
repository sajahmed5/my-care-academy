import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { DueTabs } from "../due-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { reviewHref, reviewRows, type ReviewRecord, type ReviewRow } from "@/lib/form-reviews";
import { audienceOf } from "@/lib/form-library";
import { formatDate } from "@/lib/dates";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

const GROUPS: { status: ReviewRow["status"]; label: string; chip: string }[] = [
  { status: "overdue", label: "Overdue", chip: "bg-rose-100 text-rose-700" },
  { status: "due_soon", label: "Due in the next 30 days", chip: "bg-amber-100 text-amber-700" },
  { status: "scheduled", label: "Due later", chip: "bg-muted text-muted-foreground" },
];

const unwrap = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

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

  // Every record is read, not only dated ones: a newer record without a date
  // still replaces an older one that had a date.
  const rows = await fetchAll((f, t) =>
    supabase
      .from("form_responses")
      .select(
        "id, template_id, subject, client_id, user_id, submitted_at, review_due, template:form_templates (code, title), client:clients (full_name, status), person:users!form_responses_user_id_fkey (full_name, email, status)",
      )
      .eq("organisation_id", orgId)
      .order("id")
      .range(f, t),
  );
  const records: ReviewRecord[] = rows
    // An ended client or a member of staff who has left has nothing to review.
    .filter((r) => {
      const c = unwrap(r.client as { status?: string } | null);
      const u = unwrap(r.person as { status?: string } | null);
      if (r.subject === "client") return c?.status === "active";
      if (r.subject === "carer") return u?.status === "active";
      return true;
    })
    .map((r) => {
      const t = unwrap(r.template as { code?: string; title?: string } | null);
      const c = unwrap(r.client as { full_name?: string } | null);
      const u = unwrap(r.person as { full_name?: string | null; email?: string } | null);
      return {
        id: r.id as string,
        templateId: r.template_id as string,
        templateCode: t?.code ?? "",
        templateTitle: t?.title ?? "Form",
        subject: audienceOf(r.subject),
        clientId: (r.client_id as string | null) ?? null,
        clientName: c?.full_name ?? null,
        userId: r.user_id as string,
        userName: u?.full_name ?? u?.email ?? "Unnamed",
        submittedAt: r.submitted_at as string,
        reviewDue: (r.review_due as string | null) ?? null,
      };
    });
  const due = reviewRows(records, new Date());

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

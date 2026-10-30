import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DUE_GROUP_LABEL } from "@/lib/due-view";
import { formatDate } from "@/lib/dates";
import { reviewsDue, type PolicyReviewRow } from "@/lib/policy-digest";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Policies due (POLICIES.md, "Review dates"): every published policy and when
 * its review falls, overdue first — beside the other Who's due lists, and the
 * same count the weekly email gives.
 */
export default async function PoliciesDuePage() {
  const context = await requireConsole();
  await requireFeature(context, "documents.library");
  const supabase = await createClient();
  const { data } = await supabase
    .from("organisation_policies")
    .select("id, status, version, review_due_on, policy_documents(code, title)")
    .eq("organisation_id", context.organisationId!)
    .eq("status", "published")
    .gt("version", 0)
    .limit(500);

  const rows: PolicyReviewRow[] = (data ?? []).map((c) => {
    const doc = (Array.isArray(c.policy_documents) ? c.policy_documents[0] : c.policy_documents) as
      | { code: string; title: string }
      | null;
    return {
      copyId: c.id as string,
      title: doc?.title ?? "Policy",
      code: doc?.code ?? "",
      reviewDueOn: (c.review_due_on as string | null) ?? null,
    };
  });
  const due = reviewsDue(rows, new Date());
  const groups = (["overdue", "due_soon", "scheduled", "none"] as const)
    .map((status) => ({ status, items: due.filter((r) => r.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <DashboardShell title="Policies due" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Each published policy and when it is next reviewed. Open one to mark it reviewed, or to change it and publish a new
          version.
        </p>
        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No published policies yet.{" "}
              <Link href="/org/policies" className="font-medium text-primary hover:underline">
                Start from the library
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          groups.map((g) => (
            <section key={g.status} className="space-y-2">
              <h3 className={`text-sm font-semibold ${g.status === "overdue" ? "text-rose-700" : "text-muted-foreground"}`}>
                {g.status === "none" ? "No review date" : DUE_GROUP_LABEL[g.status]} ({g.items.length})
              </h3>
              <Card>
                <CardContent className="divide-y p-0">
                  {g.items.map((r) => (
                    <Link
                      key={r.copyId}
                      href={`/org/policies/${r.code}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium">{r.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.reviewDueOn ? `Review ${g.status === "overdue" ? "was due" : "due"} ${fmt(r.reviewDueOn)}` : "—"}
                      </span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </section>
          ))
        )}
      </div>
    </DashboardShell>
  );
}

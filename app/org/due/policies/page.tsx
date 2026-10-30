import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DUE_GROUP_LABEL } from "@/lib/due-view";
import { formatDate } from "@/lib/dates";
import { reviewsDue, type PolicyReviewRow } from "@/lib/policy-digest";
import { loadReading } from "@/lib/policy-reading-data";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Policies due (POLICIES.md): who is late accepting a policy, and every
 * published policy's next review, overdue first — beside the other Who's due
 * lists, and the same counts the weekly email gives.
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

  // Late acceptances, by policy, longest overdue first.
  const reading = await loadReading(supabase, context.organisationId!);
  const nameOf = new Map(reading.people.map((p) => [p.id, p.name]));
  const lateByCopy = reading.copies
    .map((c) => ({
      copy: c,
      late: reading.entries
        .filter((e) => e.copyId === c.copyId && e.status === "late")
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
    }))
    .filter((g) => g.late.length > 0)
    .sort((a, b) => a.late[0].dueOn.localeCompare(b.late[0].dueOn));
  const groups = (["overdue", "due_soon", "scheduled", "none"] as const)
    .map((status) => ({ status, items: due.filter((r) => r.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <DashboardShell title="Policies due" context={context}>
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className={`text-sm font-semibold ${lateByCopy.length ? "text-rose-700" : "text-muted-foreground"}`}>
            Late accepting ({lateByCopy.reduce((n, g) => n + g.late.length, 0)})
          </h3>
          {lateByCopy.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is late reading a policy.</p>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {lateByCopy.map((g) => (
                  <Link
                    key={g.copy.copyId}
                    href={`/org/policies/${g.copy.code}`}
                    className="block px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium">{g.copy.title}</span>
                    <span className="ml-2 text-xs text-rose-700">{g.late.length} late</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {g.late.map((e) => `${nameOf.get(e.userId) ?? "Someone"} (due ${fmt(e.dueOn)})`).join(", ")}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            They are reminded by email.{" "}
            <Link href="/org/policies/people" className="font-medium text-primary hover:underline">
              Everyone, policy by policy
            </Link>
          </p>
        </section>

        <h3 className="pt-2 text-base font-semibold">Reviews</h3>
        <p className="-mt-4 text-sm text-muted-foreground">
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

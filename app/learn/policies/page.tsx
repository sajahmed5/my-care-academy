import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/learner-ui";
import { Card, CardContent } from "@/components/ui/card";
import { loadCopies, loadLibrary } from "@/lib/policy-library";
import { loadReading } from "@/lib/policy-reading-data";
import { formatDate } from "@/lib/dates";

/**
 * The policies a carer is asked to read and accept.
 *
 * Policies only — never the forms and logs, which are the manager's to print.
 * The list leads with what is still to accept, because that is the only
 * reason a carer opens it.
 */
export default async function LearnerPoliciesPage() {
  const context = await requireStaff();
  await requireFeature(context, "documents.library", "/learn");

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organisations")
    .select("name, service_type")
    .eq("id", context.organisationId!)
    .single();

  // Only what the organisation has adopted, completed and published — a
  // carer never reads a template (ROADMAP §1). The version is the copy's, and
  // so is the acceptance.
  // Only the policies meant for this person (POLICIES.md, "Who must read
  // what"), each with the date to accept it by.
  const [library, copies, reading] = await Promise.all([
    loadLibrary(supabase, {
      serviceType: (org?.service_type as string | null) ?? null,
      userId: context.userId,
    }),
    loadCopies(supabase, context.organisationId!),
    loadReading(supabase, context.organisationId!, { userId: context.userId }),
  ]);
  const entryOf = new Map(reading.entries.map((e) => [e.copyId, e]));
  const policies = library.flatMap((d) => {
    const c = copies.get(d.id);
    const entry = c ? entryOf.get(c.id) : undefined;
    if (!c || !entry) return [];
    return [{ ...d, version: c.version, acknowledgedVersion: entry.acceptedVersion, entry }];
  });

  const outstanding = policies
    .filter((p) => p.entry.status !== "accepted")
    .sort((a, b) => a.entry.dueOn.localeCompare(b.entry.dueOn));
  const done = policies.filter((p) => p.entry.status === "accepted");

  return (
    <DashboardShell learn title="Policies" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {org?.name ?? "Your organisation"}&apos;s policies. Read each one and
          accept it — your acceptance is recorded against you, with the date and
          the version you read.
        </p>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            To read and accept ({outstanding.length})
          </h3>
          {outstanding.length === 0 ? (
            <EmptyState
              title={policies.length === 0 ? "No policies to read yet" : "You're up to date"}
            >
              {policies.length === 0
                ? "When your manager publishes a policy for you to read, it will be here."
                : "You have accepted every policy."}
            </EmptyState>
          ) : (
            // Soonest deadline first: that is the order to read them in.
            <div className="space-y-2">
              {outstanding.map((p) => (
                <Card key={p.id}>
                  <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                    <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <Link href={`/learn/policies/${p.code}`} className="min-w-0 flex-1 font-medium hover:underline">
                      {p.title}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.entry.status === "late" ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.entry.status === "late" ? "Overdue — " : "Read by "}
                      {formatDate(p.entry.dueOn, { day: "numeric", month: "short" })}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {done.length > 0 && (
          <details className="rounded-lg border bg-muted/20 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              Accepted ({done.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {done.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/learn/policies/${p.code}`} className="hover:underline">
                    {p.title}
                  </Link>
                  <span className="inline-flex items-center gap-1 text-xs text-green-700">
                    <Check className="size-3.5" /> version {p.acknowledgedVersion}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </DashboardShell>
  );
}

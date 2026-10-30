import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/learner-ui";
import { Card, CardContent } from "@/components/ui/card";
import { byCategory, loadCopies, loadLibrary } from "@/lib/policy-library";

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
  const [library, copies, { data: acks }] = await Promise.all([
    loadLibrary(supabase, {
      serviceType: (org?.service_type as string | null) ?? null,
      userId: context.userId,
    }),
    loadCopies(supabase, context.organisationId!),
    supabase
      .from("policy_acknowledgements")
      .select("organisation_policy_id, version")
      .eq("user_id", context.userId)
      .not("organisation_policy_id", "is", null),
  ]);
  const ackOf = new Map<string, number>();
  for (const a of acks ?? []) {
    const id = a.organisation_policy_id as string;
    ackOf.set(id, Math.max(ackOf.get(id) ?? 0, a.version as number));
  }
  const policies = library.flatMap((d) => {
    const c = copies.get(d.id);
    if (d.kind !== "policy" || !c || c.status !== "published" || c.version < 1) return [];
    return [{ ...d, version: c.version, acknowledgedVersion: ackOf.get(c.id) ?? null }];
  });

  const isAccepted = (p: (typeof policies)[number]) =>
    p.acknowledgedVersion != null && p.acknowledgedVersion >= (p.version ?? 1);
  const outstanding = policies.filter((p) => !isAccepted(p));
  const done = policies.filter(isAccepted);

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
            byCategory(outstanding).map(([category, items]) => (
              <div key={category} className="space-y-2">
                <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {category}
                </p>
                {items.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="flex items-center gap-3 pt-6">
                      <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <Link href={`/learn/policies/${p.code}`} className="font-medium hover:underline">
                        {p.title}
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))
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

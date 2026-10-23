import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { byCategory, loadLibrary } from "@/lib/policy-library";

/**
 * The policies a carer is asked to read and accept.
 *
 * Policies only — never the forms and logs, which are the manager's to print.
 * The list leads with what is still to accept, because that is the only
 * reason a carer opens it.
 */
export default async function LearnerPoliciesPage() {
  const context = await requireRole("learner");
  await requireFeature(context, "documents.library", "/learn");

  const supabase = await createClient();
  const [enabled, { data: org }] = await Promise.all([
    enabledMap(context),
    supabase
      .from("organisations")
      .select("name, service_type")
      .eq("id", context.organisationId!)
      .single(),
  ]);

  const policies = (
    await loadLibrary(supabase, {
      enabled,
      serviceType: (org?.service_type as string | null) ?? null,
      userId: context.userId,
    })
  ).filter((d) => d.kind === "policy");

  const isAccepted = (p: (typeof policies)[number]) =>
    p.acknowledgedVersion != null && p.acknowledgedVersion >= (p.version ?? 1);
  const outstanding = policies.filter((p) => !isAccepted(p));
  const done = policies.filter(isAccepted);

  return (
    <DashboardShell title="Policies" context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
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
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nothing outstanding — you have accepted every policy.
              </CardContent>
            </Card>
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { enabledMap, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PolicyBody } from "@/components/policy-body";
import { PolicyAcceptButton } from "@/components/policy-accept-button";
import { loadPolicy, render, visiblePacks } from "@/lib/policy-library";

/**
 * One policy, read by the carer it is addressed to, with their employer's
 * name in it and the acceptance at the end — after the text, not beside it,
 * because the point is that they read it first.
 */
export default async function LearnerPolicyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const context = await requireRole("learner");
  await requireFeature(context, "documents.library", "/learn");
  const { code } = await params;

  const supabase = await createClient();
  const [enabled, { data: org }] = await Promise.all([
    enabledMap(context),
    supabase
      .from("organisations")
      .select("name")
      .eq("id", context.organisationId!)
      .single(),
  ]);

  const doc = await loadPolicy(supabase, decodeURIComponent(code), context.userId);
  // Carers read policies. The forms are the manager's, and a pack the
  // organisation has not bought is nobody's.
  if (!doc || doc.kind !== "policy") notFound();
  const { packs, collections } = visiblePacks(enabled);
  if (!packs.includes(doc.pack) || (doc.pack === "addon" && !collections.includes(doc.collection ?? ""))) {
    notFound();
  }

  const version = doc.version ?? 1;
  const blocks = render(doc.blocks, (org?.name as string) ?? "Your organisation");

  return (
    <DashboardShell title={doc.title} context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/learn/policies" className="text-sm text-muted-foreground hover:underline">
          ← All policies
        </Link>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{doc.title}</h2>
          <p className="text-sm text-muted-foreground">{doc.category}</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <PolicyBody blocks={blocks} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <PolicyAcceptButton
              policyId={doc.id}
              code={doc.code}
              version={version}
              accepted={doc.acknowledgedVersion != null && doc.acknowledgedVersion >= version}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

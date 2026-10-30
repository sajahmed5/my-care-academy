import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { lockedHref } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { Card, CardContent } from "@/components/ui/card";
import { loadPolicySettings, serviceLabel } from "@/lib/policy-library";
import { CompanyForm, PolicyRowsForm, type PolicyRow } from "./settings-forms";
import { isAudience } from "@/lib/policy-reading";

/**
 * The company's policy setup (POLICIES.md): who must read each policy and by
 * when, how often they are reviewed, and the details merged into them.
 * Managers only, under Settings — the policies themselves are worked on from
 * the menu.
 */
export default async function PolicySettingsPage() {
  const context = await requireRole("org_admin");
  if (!(await hasFeature(context, "documents.library"))) redirect(lockedHref("documents.library"));
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [settings, { data: copies }] = await Promise.all([
    loadPolicySettings(supabase, orgId),
    supabase
      .from("organisation_policies")
      .select("id, status, version, review_months, audience, accept_within_days, policy_documents(title, category, service_types, sort_order)")
      .eq("organisation_id", orgId)
      .limit(500),
  ]);
  const acceptDays = settings.accept_within_days;

  const rows: PolicyRow[] = (copies ?? [])
    .map((c) => {
      const doc = (Array.isArray(c.policy_documents) ? c.policy_documents[0] : c.policy_documents) as
        | { title: string; service_types: string[] | null }
        | null;
      return {
        copyId: c.id as string,
        title: doc?.title ?? "Policy",
        service: serviceLabel(doc?.service_types ?? null),
        status: c.status === "published" && (c.version as number) > 0 ? `Published, version ${c.version}` : "Draft",
        reviewMonths: (c.review_months as number | null) ?? null,
        audience: isAudience(c.audience) ? c.audience : "everyone",
        acceptWithinDays: (c.accept_within_days as number | null) ?? null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <SettingsShell context={context} active="/org/settings/policies">
      <div className="space-y-8">
        <CompanyForm settings={settings} acceptDays={acceptDays} />

        <section className="space-y-2">
          <div>
            <h3 className="font-semibold">Each policy</h3>
            <p className="text-sm text-muted-foreground">
              Who must read it, how long they have, and how often it is reviewed. Office staff and managers can read any
              policy; only the people it is for are asked to accept it.
            </p>
          </div>
          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                You have not adopted a policy yet. Start from{" "}
                <Link href="/org/policies" className="font-medium text-primary hover:underline">
                  Policies
                </Link>
                ; each one you adopt appears here.
              </CardContent>
            </Card>
          ) : (
            <PolicyRowsForm rows={rows} companyMonths={settings.review_months} companyDays={acceptDays} />
          )}
        </section>
      </div>
    </SettingsShell>
  );
}

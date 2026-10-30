import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { intervalLabel } from "@/lib/audit-forms";
import { DEFAULT_SERVICE_FORMS } from "@/lib/service-audits";
import { loadQaForm, loadReviewBelow, loadServiceForms } from "@/lib/service-audits-data";
import { QA_FORM_KEY } from "@/lib/client-qa";
import { AuditSwitch, ReviewLevel } from "./controls";

/**
 * Every service audit the company does, with how often each falls due
 * (SERVICE-AUDITS.md, Editable). Each starts as ours; a company changes any
 * of them, adds its own, or stops one. Managers only, under Settings.
 */
export default async function ServiceAuditSettingsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "quality.audits");
  const orgId = context.organisationId!;
  const supabase = await createClient();
  const [forms, qa, reviewBelow, { data: rows }] = await Promise.all([
    loadServiceForms(orgId),
    loadQaForm(orgId),
    loadReviewBelow(orgId),
    supabase.from("service_audit_forms").select("key, label, archived").eq("organisation_id", orgId).limit(200),
  ]);
  const changed = (key: string) => (rows ?? []).some((r) => r.key === key && !r.archived);
  const stopped = (rows ?? []).filter((r) => r.archived);

  const section = (title: string, scope: "client" | "service", hint: string) => {
    const list = forms.filter((f) => f.scope === scope);
    return (
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Card>
          <CardContent className="divide-y p-0">
            {scope === "client" && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <Link href={`/org/settings/service-audits/edit?form=${QA_FORM_KEY}`} className="font-medium text-primary hover:underline">
                    Client QA
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Five CQC ratings, {qa.medication.length} medication and {qa.own.length} of your own questions · {intervalLabel(qa.due).toLowerCase()} ·{" "}
                    {changed(QA_FORM_KEY) ? "changed by you" : "our default"}
                  </p>
                </div>
                <Link href={`/org/settings/service-audits/edit?form=${QA_FORM_KEY}`} className="text-sm font-medium text-primary hover:underline">
                  Edit
                </Link>
              </div>
            )}
            {list.length === 0 && scope === "service" && <p className="px-4 py-3 text-sm text-muted-foreground">None.</p>}
            {list.map((f) => {
              const href = `/org/settings/service-audits/edit?form=${f.key}`;
              return (
                <div key={f.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <Link href={href} className="font-medium text-primary hover:underline">
                      {f.label}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {f.questions.length} questions · {intervalLabel(f.due).toLowerCase()}
                      {f.medicationOnly ? " · clients you help with medicines" : ""} ·{" "}
                      {!f.ours ? "your own" : changed(f.key) ? "changed by you" : "our default"}
                    </p>
                  </div>
                  <span className="flex items-center gap-3">
                    {f.ours && <AuditSwitch formKey={f.key} archived={false} />}
                    <Link href={href} className="text-sm font-medium text-primary hover:underline">
                      Edit
                    </Link>
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>
    );
  };

  return (
    <SettingsShell context={context} active="/org/settings/service-audits">
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          The questions on each audit, and how often it falls due. Each starts as ours — change any of them to suit how you work,
          or add your own. Audits already done keep the questions they were asked with.
        </p>

        <div className="flex justify-end">
          <Link href="/org/settings/service-audits/edit?form=new" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Plus className="size-4" /> Add your own audit
          </Link>
        </div>

        {section("Client by client", "client", "One for each client, due client by client.")}
        {section("Across the service", "service", "One for the whole service.")}

        {stopped.length > 0 && (
          <Card>
            <CardContent className="divide-y p-0">
              {stopped.map((r) => (
                <div key={r.key as string} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">
                    {(r.label as string | null) ?? DEFAULT_SERVICE_FORMS.find((d) => d.key === r.key)?.label ?? (r.key as string)} — not done any more
                  </span>
                  <AuditSwitch formKey={r.key as string} archived />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">Manager review</h2>
            <p className="text-xs text-muted-foreground">
              An audit or client QA scoring below this waits for a manager to review it, so CQC can see results are looked at,
              not just filed.
            </p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <ReviewLevel value={reviewBelow} />
            </CardContent>
          </Card>
        </section>
      </div>
    </SettingsShell>
  );
}

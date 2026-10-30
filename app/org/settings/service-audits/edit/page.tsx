import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { loadQaForm, loadServiceForms } from "@/lib/service-audits-data";
import { QA_FORM_KEY } from "@/lib/client-qa";
import { ServiceFormEditor } from "./form-editor";
import { QaFormEditor } from "./qa-editor";

/** Edit one audit: `?form=<key>`, `?form=client_qa` for the QA, or `?form=new` for one of the company's own. */
export default async function EditServiceFormPage({ searchParams }: { searchParams: Promise<{ form?: string }> }) {
  const context = await requireRole("org_admin");
  await requireFeature(context, "quality.audits");
  const { form: key = "" } = await searchParams;
  const orgId = context.organisationId!;
  const supabase = await createClient();
  const [forms, { data: row }] = await Promise.all([
    loadServiceForms(orgId),
    supabase.from("service_audit_forms").select("id").eq("organisation_id", orgId).eq("key", key).maybeSingle(),
  ]);
  if (key === QA_FORM_KEY) {
    return (
      <SettingsShell context={context} active="/org/settings/service-audits">
        <div className="space-y-4">
          <Link href="/org/settings/service-audits" className="text-sm text-muted-foreground hover:underline">
            ← All audits
          </Link>
          <h3 className="font-semibold">Client QA</h3>
          <QaFormEditor initial={await loadQaForm(orgId)} changed={!!row} />
        </div>
      </SettingsShell>
    );
  }
  const isNew = key === "new";
  const form = isNew ? null : forms.find((f) => f.key === key);
  if (!isNew && !form) notFound();

  return (
    <SettingsShell context={context} active="/org/settings/service-audits">
      <div className="space-y-4">
        <Link href="/org/settings/service-audits" className="text-sm text-muted-foreground hover:underline">
          ← All audits
        </Link>
        <h3 className="font-semibold">{form ? form.label : "Your own audit"}</h3>
        <ServiceFormEditor
          initial={
            form
              ? { key: form.key, label: form.label, scope: form.scope, questions: form.questions, due: form.due }
              : { key: "", label: "", scope: "service", questions: [], due: { every: 3, unit: "months" } }
          }
          isNew={isNew}
          ours={form?.ours ?? false}
          changed={!!row}
        />
      </div>
    </SettingsShell>
  );
}

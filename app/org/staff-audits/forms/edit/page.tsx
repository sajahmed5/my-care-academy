import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { COMPETENCY_FORMS } from "@/lib/audit-forms";
import { loadAuditForms } from "@/lib/audit-forms-data";
import { FormEditor } from "./form-editor";

/**
 * Edit one form: `?form=supervision`, `appraisal`, `spot_check`,
 * `competency:<skill>`, or `competency:new` for a skill of the company's own.
 */
export default async function EditAuditFormPage({ searchParams }: { searchParams: Promise<{ form?: string }> }) {
  const context = await requireConsole();
  const { form: param = "" } = await searchParams;
  const [kind, area = ""] = param.split(":");
  if (kind !== "supervision" && kind !== "appraisal" && kind !== "spot_check" && kind !== "competency") notFound();
  await requireFeature(context, kind === "supervision" || kind === "appraisal" ? "people.supervisions" : "people.competency");
  const orgId = context.organisationId!;
  const supabase = await createClient();
  const [forms, { data: row }] = await Promise.all([
    loadAuditForms(orgId),
    supabase
      .from("staff_audit_forms")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("kind", kind)
      .eq("area_key", kind === "competency" && area !== "new" ? area : "")
      .maybeSingle(),
  ]);

  let initial: Parameters<typeof FormEditor>[0]["initial"];
  if (kind === "supervision" || kind === "appraisal") {
    const f = forms[kind];
    initial = { kind, areaKey: "", label: f.label, questions: f.questions, selfAssessment: f.selfAssessment, due: f.due };
  } else if (kind === "spot_check") {
    const f = forms.spotCheck;
    initial = { kind, areaKey: "", label: f.label, questions: f.items, selfAssessment: [], due: f.due };
  } else if (area === "new") {
    initial = { kind, areaKey: "", label: "", questions: [], selfAssessment: [], due: { every: 12, unit: "months" } };
  } else {
    const f = forms.competency.find((c) => c.key === area);
    if (!f) notFound();
    initial = { kind, areaKey: f.key, label: f.label, questions: f.items, selfAssessment: [], due: f.due };
  }
  const ours = kind !== "competency" || COMPETENCY_FORMS.some((f) => f.key === area);
  const title = kind === "competency" ? (area === "new" ? "A new skill" : `Competency: ${initial.label}`) : initial.label;

  return (
    <DashboardShell title={title} context={context}>
      <div className="space-y-4">
        <Link href="/org/staff-audits/forms" className="text-sm text-muted-foreground hover:underline">
          ← All forms
        </Link>
        <FormEditor initial={initial} isNew={area === "new"} changed={!!row} ours={ours} />
      </div>
    </DashboardShell>
  );
}

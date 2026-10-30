import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Answers } from "@/lib/recruitment-application";
import { companyQuestions } from "@/lib/company-questions";
import { customSection } from "@/lib/custom-questions";
import { DBS_RISK_CUSTOM_TITLE, dbsRiskSections } from "@/lib/recruitment-dbs-risk";
import { DashboardShell } from "@/components/dashboard-shell";
import { RecordForm } from "../record-form";
import { saveDbsRiskAction } from "../../actions";

/** The DBS risk assessment, for a candidate whose DBS shows a conviction. */
export default async function DbsRiskPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: candidate }, { data: record }, { custom }] = await Promise.all([
    supabase.from("candidates").select("full_name, dbs_conviction").eq("id", id).maybeSingle(),
    supabase.from("candidate_dbs_assessments").select("answers, status").eq("candidate_id", id).maybeSingle(),
    companyQuestions(createAdminClient(), context.organisationId!),
  ]);
  if (!candidate) notFound();
  const initial = (record?.answers as Answers | null) ?? { discussedOn: new Date().toISOString().slice(0, 10) };
  const sections = dbsRiskSections(customSection(custom.dbs_risk, { title: DBS_RISK_CUSTOM_TITLE, answered: initial }));
  return (
    <DashboardShell
      title={`DBS risk assessment: ${candidate.full_name as string}`}
      context={context}
      back={{ href: `/org/recruitment/${id}`, label: candidate.full_name as string }}
    >
      {!candidate.dbs_conviction ? (
        <p className="text-sm text-muted-foreground">Only needed when the DBS shows a conviction. Tick that on their page first.</p>
      ) : (
        <RecordForm
          candidateId={id}
          sections={sections}
          initial={initial}
          complete={record?.status === "complete"}
          intro="Talk it through with them before you decide. Only the office sees this; it moves onto their staff file when they're hired."
          save={saveDbsRiskAction}
        />
      )}
    </DashboardShell>
  );
}

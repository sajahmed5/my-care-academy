import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadAuditForms } from "@/lib/audit-forms-data";
import { CheckForm } from "../../check-form";

/** A competency assessment: one skill, `?area=`, against its own criteria. */
export default async function NewCompetencyPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ area?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "people.competency");
  const { userId } = await params;
  const { area } = await searchParams;
  const supabase = await createClient();
  const [{ data: person }, forms] = await Promise.all([
    supabase.from("users").select("id, full_name, email, role").eq("id", userId).maybeSingle(),
    loadAuditForms(context.organisationId!),
  ]);
  if (!person || person.role !== "learner") notFound();
  const name = (person.full_name as string | null) || (person.email as string);
  return (
    <DashboardShell title={`Competency — ${name}`} context={context} back={{ href: `/org/staff/${userId}?section=competency`, label: name }}>
      <CheckForm mode="competency" userId={userId} personName={name} forms={forms.competency} initialArea={area} clients={null} />
    </DashboardShell>
  );
}

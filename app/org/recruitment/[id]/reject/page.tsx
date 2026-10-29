import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { letterDefaultsFromRow, sanitiseRejection } from "@/lib/recruitment-letters";
import { DashboardShell } from "@/components/dashboard-shell";
import { RejectForm } from "./reject-form";

/**
 * Not taking a candidate forward (RECRUITMENT.md, release 5): tick the
 * reasons, add a line, say whether they may apply again, and send the letter
 * — or close it without one.
 */
export default async function RejectPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const admin = createAdminClient();
  const { data: c } = await admin
    .from("candidates")
    .select("full_name, email, role_applied, status, organisation_id, organisations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!c || c.organisation_id !== context.organisationId) notFound();
  const [{ data: letter }, { data: settingsRow }] = await Promise.all([
    admin.from("candidate_letters").select("fields").eq("candidate_id", id).eq("kind", "rejection").maybeSingle(),
    admin.from("recruitment_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle(),
  ]);
  const d = letterDefaultsFromRow(settingsRow);
  const initial = sanitiseRejection(letter?.fields ?? { signatoryName: d.signatoryName, signatoryTitle: d.signatoryTitle, reapplyMonths: 6 });
  return (
    <DashboardShell
      title={`Not taking forward: ${c.full_name as string}`}
      context={context}
      back={{ href: `/org/recruitment/${id}`, label: c.full_name as string }}
    >
      <RejectForm
        candidateId={id}
        candidateName={c.full_name as string}
        companyName={(c.organisations as unknown as { name: string } | null)?.name ?? ""}
        position={(c.role_applied as string | null) ?? null}
        email={(c.email as string | null) ?? null}
        initial={initial}
        closed={c.status !== "candidate"}
      />
    </DashboardShell>
  );
}

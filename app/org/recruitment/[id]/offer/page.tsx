import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiStatus } from "@/lib/ai";
import { formatDate } from "@/lib/dates";
import { progress, settingsFromRow, type CandidateDocRecord } from "@/lib/recruitment";
import { letterDefaultsFromRow, sanitiseLetterSettings, sanitiseOffer, type OfferFields } from "@/lib/recruitment-letters";
import { DashboardShell } from "@/components/dashboard-shell";
import { OfferForm } from "./offer-form";

/**
 * The conditional offer (RECRUITMENT.md, release 5): the company's wording,
 * "why we chose you" written by the office or drafted by AI, a preview of
 * exactly what is sent, then Send.
 */
export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const admin = createAdminClient();
  const { data: c } = await admin
    .from("candidates")
    .select("full_name, email, role_applied, status, organisation_id, dbs_conviction, organisations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!c || c.organisation_id !== context.organisationId) notFound();
  const [{ data: letter }, { data: settingsRow }, { data: docs }, { data: interview }, ai] = await Promise.all([
    admin.from("candidate_letters").select("fields, sent_at, sent_to").eq("candidate_id", id).eq("kind", "offer").maybeSingle(),
    admin.from("recruitment_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle(),
    admin.from("candidate_documents").select("doc_type, file_path, expires_at, not_required, review_status").eq("candidate_id", id),
    admin.from("candidate_interviews").select("status, outcome").eq("candidate_id", id).maybeSingle(),
    aiStatus(admin, context.organisationId!),
  ]);
  const steps = progress((docs ?? []) as CandidateDocRecord[], settingsFromRow(settingsRow), { dbsConviction: c.dbs_conviction === true }).flatMap((s) => s.steps);
  const defaults = letterDefaultsFromRow(settingsRow);
  const initial: OfferFields = letter?.fields
    ? sanitiseOffer(letter.fields)
    : sanitiseOffer({ position: c.role_applied ?? "Carer", ...defaults, whyHired: "" });
  const interviewConfirmed = steps.find((s) => s.key === "interview")?.state === "confirmed";

  return (
    <DashboardShell
      title={`Offer: ${c.full_name as string}`}
      context={context}
      back={{ href: `/org/recruitment/${id}`, label: c.full_name as string }}
    >
      <OfferForm
        candidateId={id}
        candidateName={c.full_name as string}
        companyName={(c.organisations as unknown as { name: string } | null)?.name ?? ""}
        email={(c.email as string | null) ?? null}
        initial={initial}
        conditions={sanitiseLetterSettings(settingsRow?.letter_settings).conditions}
        referees={steps.some((s) => s.key === "reference_3" && s.required) ? 3 : 2}
        sent={letter?.sent_at ? `Sent to ${letter.sent_to} on ${formatDate(letter.sent_at as string)}.` : null}
        blocked={
          c.status !== "candidate"
            ? "They're no longer a candidate."
            : !interviewConfirmed
              ? "Confirm the interview before sending an offer."
              : null
        }
        unsuccessful={interview?.outcome === "Unsuccessful"}
        ai={{ allowed: ai.allowed, reason: ai.reason ?? null }}
      />
    </DashboardShell>
  );
}

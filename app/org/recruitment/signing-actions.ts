"use server";

import { revalidatePath } from "next/cache";
import { requireConsole, requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { inviteCandidate } from "@/lib/candidate-account";
import { jobTitlesOf, progress, settingsFromRow, type CandidateDocRecord } from "@/lib/recruitment";
import { emailDocumentsReady, wordingInForce } from "@/lib/signing";
import {
  DEFAULT_SIGNING_DOCUMENTS,
  SIGNING_DOC_KEYS,
  addressFromApplication,
  allPartsDone,
  sendProblems,
  snapshotFor,
  validSignature,
  type PartState,
  type SigningDocKey,
  type Snapshot,
} from "@/lib/signing-documents";

/**
 * Documents signed online (RECRUITMENT.md, release 6): the company's
 * wording, sending a candidate their documents, and the company's
 * countersignature.
 */

type Result = { ok: boolean; error?: string; message?: string };
const isKey = (k: string): k is SigningDocKey => (SIGNING_DOC_KEYS as string[]).includes(k);

/** A new version of one part's wording. Managers only. */
export async function saveWordingAction(docKey: string, partId: string, body: string): Promise<Result> {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  if (!isKey(docKey) || !DEFAULT_SIGNING_DOCUMENTS[docKey].parts.some((p) => p.id === partId)) return { ok: false, error: "Unknown document." };
  const text = String(body ?? "").replace(/\r/g, "").trim();
  if (text.length < 20) return { ok: false, error: "That's too short to be the document." };
  if (text.length > 40_000) return { ok: false, error: "That's too long. Keep each part under 40,000 characters." };
  const admin = createAdminClient();
  const orgId = context.organisationId!;
  const { data: latest } = await admin
    .from("recruitment_documents")
    .select("version, body")
    .eq("organisation_id", orgId)
    .eq("doc_key", docKey)
    .eq("part_id", partId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest?.body === text) return { ok: true, message: "No changes to save." };
  const version = ((latest?.version as number | undefined) ?? 0) + 1;
  const { error } = await admin
    .from("recruitment_documents")
    .insert({ organisation_id: orgId, doc_key: docKey, part_id: partId, version, body: text, created_by: context.userId });
  if (error) return { ok: false, error: "The wording couldn't be saved. Try again." };
  await logAudit({ context, action: "recruitment.wording_saved", entity: "organisation", entityId: orgId, detail: { docKey, partId, version } });
  revalidatePath("/org/settings/recruitment/documents");
  return { ok: true, message: `Saved as version ${version}.` };
}

/**
 * Send the candidate the stage 4 documents to sign, with the wording frozen
 * as it stands now. A document already signed isn't sent again.
 */
export async function sendForSigningAction(candidateId: string, startDate: string, address: string): Promise<Result> {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: "Give their start date." };
  const admin = createAdminClient();
  const orgId = context.organisationId!;
  const { data: c } = await admin
    .from("candidates")
    .select("id, full_name, email, organisation_id, status, role_applied, dbs_conviction, user_id, organisations(name)")
    .eq("id", candidateId)
    .maybeSingle();
  if (!c || c.organisation_id !== orgId) return { ok: false, error: "Candidate not found." };
  if (c.status !== "candidate") return { ok: false, error: "They're no longer a candidate." };
  if (!c.email) return { ok: false, error: "Add their email address first: they sign from their own login." };

  const [{ data: docs }, { data: settingsRow }, { data: app }, { data: offer }, { data: existing }] = await Promise.all([
    admin.from("candidate_documents").select("doc_type, file_path, expires_at, not_required, review_status").eq("candidate_id", candidateId),
    admin.from("recruitment_settings").select("*").eq("organisation_id", orgId).maybeSingle(),
    admin.from("candidate_applications").select("answers").eq("candidate_id", candidateId).maybeSingle(),
    admin.from("candidate_letters").select("fields").eq("candidate_id", candidateId).eq("kind", "offer").maybeSingle(),
    admin.from("candidate_signings").select("doc_key, status").eq("candidate_id", candidateId),
  ]);
  const steps = progress((docs ?? []) as CandidateDocRecord[], settingsFromRow(settingsRow), { dbsConviction: c.dbs_conviction === true }).flatMap((s) => s.steps);
  const toSend = steps.filter(
    (s) => isKey(s.key) && !s.locked && s.state !== "confirmed" && s.state !== "not_needed" && !(existing ?? []).some((e) => e.doc_key === s.key && e.status !== "sent"),
  );
  if (steps.some((s) => s.key === "role_acceptance" && s.locked)) return { ok: false, error: "Stage 4 opens once the checks in stage 3 are done." };
  if (!toSend.length) return { ok: false, error: "There's nothing left for them to sign." };

  const wording = await wordingInForce(admin, orgId);
  const company = (c.organisations as unknown as { name: string } | null)?.name ?? "";
  const position = String((offer?.fields as { position?: string } | null)?.position ?? c.role_applied ?? jobTitlesOf(settingsRow?.job_titles)[0]);
  const ukDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const values = {
    candidateName: c.full_name as string,
    companyName: company,
    position,
    today: ukDate(new Date().toISOString().slice(0, 10)),
    startDate: ukDate(startDate),
    // The office's own entry wins: an application on paper has no address here.
    address: String(address ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || addressFromApplication(app?.answers as Record<string, unknown> | null),
  };
  const inForce = toSend.map((s) => wording[s.key as SigningDocKey]);
  const problems = sendProblems(inForce, values);
  if (problems.length) return { ok: false, error: problems.join(" ") };

  const now = new Date().toISOString();
  const { error } = await admin.from("candidate_signings").upsert(
    inForce.map((d) => ({
      candidate_id: candidateId,
      organisation_id: orgId,
      doc_key: d.key,
      status: "sent",
      snapshot: snapshotFor(d, values),
      state: {},
      company: null,
      sent_at: now,
      sent_by: context.userId,
      signed_at: null,
    })),
    { onConflict: "candidate_id,doc_key" },
  );
  if (error) return { ok: false, error: "The documents couldn't be sent. Try again." };

  await admin.from("candidates").update({ start_date: startDate }).eq("id", candidateId);
  if (!c.user_id) await inviteCandidate(admin, candidateId);
  const emailed = await emailDocumentsReady(admin, candidateId, inForce.map((d) => d.title));
  await logAudit({ context, action: "candidate.documents_sent", entity: "candidate", entityId: candidateId, detail: { docs: inForce.map((d) => d.key), startDate } });
  revalidatePath(`/org/recruitment/${candidateId}`);
  return { ok: true, message: emailed ? `Sent: ${inForce.map((d) => d.title).join(", ")}.` : "Ready for them to sign, but the email couldn't be sent." };
}

/**
 * The company signs a document the candidate has signed (or, for role
 * acceptance, which only they sign, accepts it). That confirms its step: the
 * signed copy is the record.
 */
export async function countersignAction(
  candidateId: string,
  docKey: string,
  sig: { dataUrl: string; signedName: string; signedTitle: string } | null,
): Promise<Result> {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  if (!isKey(docKey)) return { ok: false, error: "Unknown document." };
  const signedName = String(sig?.signedName ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const signedTitle = String(sig?.signedTitle ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("candidate_signings")
    .select("id, organisation_id, status, snapshot, state")
    .eq("candidate_id", candidateId)
    .eq("doc_key", docKey)
    .maybeSingle();
  if (!row || row.organisation_id !== context.organisationId) return { ok: false, error: "Document not found." };
  const snap = row.snapshot as Snapshot;
  if (row.status !== "signed" || !allPartsDone(snap, (row.state ?? {}) as Record<string, PartState>)) return { ok: false, error: "They haven't signed it yet." };
  // Role acceptance is theirs alone: the office reads it and accepts it.
  if (snap.countersigned && !validSignature(sig?.dataUrl)) return { ok: false, error: "Sign in the box first." };
  if (snap.countersigned && !signedName) return { ok: false, error: "Type your full name." };

  const now = new Date().toISOString();
  await admin
    .from("candidate_signings")
    .update({
      status: "countersigned",
      company: snap.countersigned && sig ? { dataUrl: sig.dataUrl, signedName, signedTitle, signedAt: now } : null,
      countersigned_at: now,
      countersigned_by: context.userId,
    })
    .eq("id", row.id as string);
  await admin.from("candidate_documents").upsert(
    {
      candidate_id: candidateId,
      organisation_id: row.organisation_id,
      doc_type: docKey,
      file_path: null,
      file_name: null,
      not_required: false,
      review_status: "confirmed",
      review_note: snap.countersigned ? `Signed online by them and by ${signedName}` : "Signed online",
      uploaded_by_candidate: true,
      reviewed_by: context.userId,
      reviewed_at: now,
    },
    { onConflict: "candidate_id,doc_type" },
  );
  await logAudit({ context, action: "candidate.document_countersigned", entity: "candidate", entityId: candidateId, detail: { docKey } });
  revalidatePath(`/org/recruitment/${candidateId}`);
  return { ok: true };
}

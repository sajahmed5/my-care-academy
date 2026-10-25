"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { type UserContext, requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvite } from "@/lib/invites";
import { logAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/entitlements";
import {
  REQUIRED_DOCS,
  notReadyMessage,
  outstandingDocs,
  type CandidateDocRecord,
  type ChecklistItem,
} from "@/lib/recruitment";

/** Recruitment is a paid add-on; block if the org isn't entitled. */
async function assertRecruitment(context: UserContext): Promise<void> {
  await requireFeature(context, "recruitment.tracker");
}

/**
 * The checklist items a candidate still owes (issue #51). Read as the service
 * role: every caller has already checked the candidate is this organisation's.
 */
async function outstandingFor(
  admin: ReturnType<typeof createAdminClient>,
  candidateId: string,
): Promise<ChecklistItem[]> {
  const { data } = await admin
    .from("candidate_documents")
    .select("doc_type, file_path, expires_at, not_required")
    .eq("candidate_id", candidateId);
  return outstandingDocs((data ?? []) as CandidateDocRecord[]);
}

export async function addCandidateAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .insert({
      organisation_id: context.organisationId,
      full_name,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      postcode: String(formData.get("postcode") ?? "").trim() || null,
      gender: String(formData.get("gender") ?? "").trim() || null,
      is_driver: formData.get("is_driver") === "on",
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not add." };

  redirect(`/org/recruitment/${data.id}`);
}

/**
 * Save stage and status. Setting status to "hired" here is the same door as
 * Mark hired, so it waits for the same checklist — otherwise the dropdown
 * would be a way round the gate.
 */
export async function updateCandidateAction(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const supabase = await createClient();

  if (patch.status === "hired") {
    const { data: current } = await supabase
      .from("candidates")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!current) return { ok: false, error: "Candidate not found." };
    if (current.status !== "hired") {
      const outstanding = await outstandingFor(createAdminClient(), id);
      if (outstanding.length > 0) return { ok: false, error: notReadyMessage(outstanding) };
    }
  }

  const { error } = await supabase.from("candidates").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/recruitment/${id}`);
  revalidatePath("/org/recruitment");
  return { ok: true };
}

/**
 * Delete a candidate, and every file uploaded for them (#59). The document
 * rows cascade with the candidate, but the files in the bucket do not — left
 * behind, a passport or DBS sits there with nothing pointing at it. The whole
 * folder goes, so files orphaned by an earlier failure go too.
 */
export async function deleteCandidateAction(id: string): Promise<void> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const { data: candidate } = await admin
    .from("candidates")
    .select("full_name, status, organisation_id")
    .eq("id", id)
    .maybeSingle();
  if (!candidate || candidate.organisation_id !== context.organisationId) redirect("/org/recruitment");

  const folder = `${context.organisationId}/${id}`;
  const { data: files } = await admin.storage.from("candidate-docs").list(folder, { limit: 1000 });
  if (files?.length) {
    await admin.storage.from("candidate-docs").remove(files.map((f) => `${folder}/${f.name}`));
  }
  await admin.from("candidates").delete().eq("id", id);
  await logAudit({
    context,
    action: "candidate.deleted",
    entity: "candidate",
    entityId: id,
    detail: { name: candidate.full_name, status: candidate.status, files_removed: files?.length ?? 0 },
  });
  revalidatePath("/org/recruitment");
  redirect("/org/recruitment");
}

export async function uploadDocumentAction(
  candidateId: string,
  docType: string,
  file: { name: string; dataUrl: string },
  expiresAt: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);

  const admin = createAdminClient();
  // The service role is not gated by RLS: the candidate must be this
  // organisation's before anything is written or replaced.
  const [{ data: candidate }, { data: previous }] = await Promise.all([
    admin.from("candidates").select("organisation_id").eq("id", candidateId).maybeSingle(),
    admin
      .from("candidate_documents")
      .select("file_path")
      .eq("candidate_id", candidateId)
      .eq("organisation_id", context.organisationId!)
      .eq("doc_type", docType)
      .maybeSingle(),
  ]);
  if (!candidate || candidate.organisation_id !== context.organisationId) {
    return { ok: false, error: "Candidate not found." };
  }

  const base64 = file.dataUrl.split(",")[1] ?? "";
  const buffer = Buffer.from(base64, "base64");
  const path = `${context.organisationId}/${candidateId}/${docType}-${crypto.randomUUID()}-${file.name}`;
  const { error: upErr } = await admin.storage
    .from("candidate-docs")
    .upload(path, buffer, { upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  // Replace any existing row of this type — a file or a "not needed".
  await admin
    .from("candidate_documents")
    .delete()
    .eq("candidate_id", candidateId)
    .eq("organisation_id", context.organisationId!)
    .eq("doc_type", docType);
  const { error } = await admin.from("candidate_documents").insert({
    candidate_id: candidateId,
    organisation_id: context.organisationId,
    doc_type: docType,
    file_path: path,
    file_name: file.name,
    expires_at: expiresAt || null,
  });
  if (error) {
    await admin.storage.from("candidate-docs").remove([path]);
    return { ok: false, error: error.message };
  }
  // The file it replaced goes too. Nothing points at it any more, and an old
  // passport or DBS kept in the bucket for no reason is data we should not hold.
  if (previous?.file_path && previous.file_path !== path) {
    await admin.storage.from("candidate-docs").remove([previous.file_path as string]);
  }

  revalidatePath(`/org/recruitment/${candidateId}`);
  revalidatePath("/org/recruitment");
  return { ok: true };
}

/**
 * Record that a checklist item does not apply to this candidate (issue #52) —
 * Right to Work for someone already checked, a literacy test for a transfer.
 * It counts as done for the hire gate, so it is attributed in the audit trail
 * with the reason given. A file already held has to be removed first: the two
 * states are exclusive, and silently discarding a DBS is not a tidy-up.
 */
export async function markDocumentNotRequiredAction(
  candidateId: string,
  docType: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  if (!REQUIRED_DOCS.some((d) => d.key === docType)) {
    return { ok: false, error: "Unknown document." };
  }

  const admin = createAdminClient();
  const { data: candidate } = await admin
    .from("candidates")
    .select("organisation_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate || candidate.organisation_id !== context.organisationId) {
    return { ok: false, error: "Candidate not found." };
  }

  const { data: existing } = await admin
    .from("candidate_documents")
    .select("file_path")
    .eq("candidate_id", candidateId)
    .eq("doc_type", docType)
    .maybeSingle();
  if (existing?.file_path) {
    return { ok: false, error: "A file is already held for this — remove it first." };
  }

  const trimmed = reason.trim();
  const { error } = await admin.from("candidate_documents").upsert(
    {
      candidate_id: candidateId,
      organisation_id: context.organisationId,
      doc_type: docType,
      file_path: null,
      file_name: null,
      expires_at: null,
      not_required: true,
      not_required_reason: trimmed || null,
    },
    { onConflict: "candidate_id,doc_type" },
  );
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    action: "candidate.document_not_required",
    entity: "candidate",
    entityId: candidateId,
    detail: { doc_type: docType, reason: trimmed || null },
  });

  revalidatePath(`/org/recruitment/${candidateId}`);
  revalidatePath("/org/recruitment");
  return { ok: true };
}

/** Remove a checklist row: the file it points at, or a "not needed". */
export async function deleteDocumentAction(
  docId: string,
  candidateId: string,
): Promise<{ ok: boolean }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("candidate_documents")
    .select("file_path, organisation_id")
    .eq("id", docId)
    .maybeSingle();
  if (doc && doc.organisation_id === context.organisationId) {
    if (doc.file_path) await admin.storage.from("candidate-docs").remove([doc.file_path]);
    await admin.from("candidate_documents").delete().eq("id", docId);
  }
  revalidatePath(`/org/recruitment/${candidateId}`);
  revalidatePath("/org/recruitment");
  return { ok: true };
}

export async function getDocUrlAction(
  path: string,
): Promise<{ url?: string }> {
  const context = await requireConsole();
  if (!path.startsWith(`${context.organisationId}/`)) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("candidate-docs")
    .createSignedUrl(path, 60);
  return { url: data?.signedUrl };
}

/**
 * Mark hired; optionally create the candidate as a learner (no auto-enrolment).
 * Refused while any checklist item is missing or expired (issue #51): the
 * button is disabled for the same reason, but the button is not the gate.
 */
export async function hireCandidateAction(
  candidateId: string,
  createLearner: boolean,
): Promise<{ ok: boolean; invited?: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);

  const admin = createAdminClient();
  const { data: candidate } = await admin
    .from("candidates")
    .select("full_name, email, organisation_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate || candidate.organisation_id !== context.organisationId) {
    return { ok: false, error: "Candidate not found." };
  }

  const outstanding = await outstandingFor(admin, candidateId);
  if (outstanding.length > 0) return { ok: false, error: notReadyMessage(outstanding) };

  await admin.from("candidates").update({ status: "hired" }).eq("id", candidateId);

  let invited = false;
  if (createLearner && candidate.email) {
    const result = await createInvite({
      email: candidate.email,
      role: "learner",
      organisationId: context.organisationId!,
      fullName: candidate.full_name,
      roleLabel: "learner",
    });
    if (result.userId) {
      invited = true;
      // No auto-enrolment. The org admin assigns courses to each staff
      // member from the Team page (assignTrainingAction), so training is
      // chosen per person rather than applied automatically on hire.
    }
  }

  await logAudit({
    context,
    action: "candidate.hired",
    entity: "candidate",
    entityId: candidateId,
    detail: { created_learner: invited },
  });

  revalidatePath(`/org/recruitment/${candidateId}`);
  revalidatePath("/org/recruitment");
  return { ok: true, invited };
}

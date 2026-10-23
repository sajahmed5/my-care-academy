"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, type UserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvite } from "@/lib/invites";
import { logAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/entitlements";

/** Recruitment is a paid add-on; block if the org isn't entitled. */
async function assertRecruitment(context: UserContext): Promise<void> {
  await requireFeature(context, "recruitment.tracker");
}

export async function addCandidateAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const context = await requireRole("org_admin");
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

export async function updateCandidateAction(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("org_admin");
  await assertRecruitment(context);
  const supabase = await createClient();
  const { error } = await supabase.from("candidates").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/recruitment/${id}`);
  revalidatePath("/org/recruitment");
  return { ok: true };
}

export async function deleteCandidateAction(id: string): Promise<void> {
  const context = await requireRole("org_admin");
  await assertRecruitment(context);
  const supabase = await createClient();
  await supabase.from("candidates").delete().eq("id", id);
  redirect("/org/recruitment");
}

export async function uploadDocumentAction(
  candidateId: string,
  docType: string,
  file: { name: string; dataUrl: string },
  expiresAt: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("org_admin");
  await assertRecruitment(context);

  const admin = createAdminClient();
  const base64 = file.dataUrl.split(",")[1] ?? "";
  const buffer = Buffer.from(base64, "base64");
  const path = `${context.organisationId}/${candidateId}/${docType}-${crypto.randomUUID()}-${file.name}`;
  const { error: upErr } = await admin.storage
    .from("candidate-docs")
    .upload(path, buffer, { upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  // Replace any existing doc of this type.
  await admin
    .from("candidate_documents")
    .delete()
    .eq("candidate_id", candidateId)
    .eq("doc_type", docType);
  const { error } = await admin.from("candidate_documents").insert({
    candidate_id: candidateId,
    organisation_id: context.organisationId,
    doc_type: docType,
    file_path: path,
    file_name: file.name,
    expires_at: expiresAt || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/org/recruitment/${candidateId}`);
  revalidatePath("/org/recruitment");
  return { ok: true };
}

export async function deleteDocumentAction(
  docId: string,
  candidateId: string,
): Promise<{ ok: boolean }> {
  const context = await requireRole("org_admin");
  await assertRecruitment(context);
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("candidate_documents")
    .select("file_path, organisation_id")
    .eq("id", docId)
    .maybeSingle();
  if (doc && doc.organisation_id === context.organisationId) {
    await admin.storage.from("candidate-docs").remove([doc.file_path]);
    await admin.from("candidate_documents").delete().eq("id", docId);
  }
  revalidatePath(`/org/recruitment/${candidateId}`);
  return { ok: true };
}

export async function getDocUrlAction(
  path: string,
): Promise<{ url?: string }> {
  const context = await requireRole("org_admin");
  if (!path.startsWith(`${context.organisationId}/`)) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("candidate-docs")
    .createSignedUrl(path, 60);
  return { url: data?.signedUrl };
}

/** Mark hired; optionally create the candidate as a learner (no auto-enrolment). */
export async function hireCandidateAction(
  candidateId: string,
  createLearner: boolean,
): Promise<{ ok: boolean; invited?: boolean; error?: string }> {
  const context = await requireRole("org_admin");
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

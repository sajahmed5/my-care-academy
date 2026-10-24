"use server";

import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLearnerCareCert, OBSERVATION_STATUSES } from "@/lib/observations";

export interface ObsState {
  ok?: boolean;
  error?: string;
}

/**
 * Record (or update) an assessor's workplace observation for one standard.
 * Writes go through the RLS-scoped client, so the org-scope + observations_enabled
 * gate is enforced by the database, not just the UI. Evidence, if attached, is
 * uploaded to the private bucket via the service role and referenced by path.
 */
export async function recordObservationAction(
  _prev: ObsState,
  formData: FormData,
): Promise<ObsState> {
  const context = await requireConsole();
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }

  const userId = String(formData.get("user_id") ?? "");
  const standardNo = Number(formData.get("standard_no") ?? 0);
  const status = String(formData.get("status") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const observedAt = String(formData.get("observed_at") ?? "").trim() || null;

  if (!userId || standardNo < 1 || standardNo > 16) {
    return { ok: false, error: "Invalid observation." };
  }
  if (!OBSERVATION_STATUSES.includes(status as (typeof OBSERVATION_STATUSES)[number])) {
    return { ok: false, error: "Invalid status." };
  }

  // Optional evidence upload (private bucket, service-role only).
  let evidencePath: string | undefined;
  const file = formData.get("evidence");
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: "Evidence file must be under 10 MB." };
    }
    const admin = createAdminClient();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${context.organisationId}/${userId}/s${standardNo}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("observation-evidence")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };
    evidencePath = path;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("care_cert_observations").upsert(
    {
      organisation_id: context.organisationId,
      user_id: userId,
      standard_no: standardNo,
      status,
      notes,
      observed_at: observedAt,
      assessor_id: context.userId,
      assessor_kind: "org",
      ...(evidencePath ? { evidence_path: evidencePath } : {}),
    },
    { onConflict: "organisation_id,user_id,standard_no" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/org/observations/${userId}`);
  revalidatePath("/org/observations");
  return { ok: true };
}

/**
 * The EMPLOYER awards the Care Certificate. Reserved to org_admin — a
 * platform_admin (MCA assessor) must never do this, so we require the org_admin
 * role explicitly and re-check eligibility server-side before writing.
 */
export async function awardCareCertificateAction(
  _prev: ObsState,
  formData: FormData,
): Promise<ObsState> {
  const context = await requireConsole();
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return { ok: false, error: "Missing learner." };

  const supabase = await createClient();

  // Re-derive eligibility from the database — never trust the client.
  const learner = await loadLearnerCareCert(supabase, userId);
  if (!learner) return { ok: false, error: "Learner not found." };
  if (learner.signedOff) {
    return { ok: false, error: "This learner has already been signed off." };
  }
  if (!learner.eligibleToAward) {
    return {
      ok: false,
      error:
        "All 16 standards must have both knowledge completed and a competent workplace observation before you can sign off.",
    };
  }

  const { error } = await supabase.from("care_cert_signoffs").insert({
    organisation_id: context.organisationId,
    user_id: userId,
    signed_by: context.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/org/observations/${userId}`);
  revalidatePath("/org/observations");
  return { ok: true };
}

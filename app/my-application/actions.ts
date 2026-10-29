"use server";

import { revalidatePath } from "next/cache";
import { requireCandidate } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { progress, settingsFromRow, type CandidateDocRecord } from "@/lib/recruitment";

/**
 * A candidate uploads a document from their own page (RECRUITMENT.md, release
 * 2b), the way MyRoster's candidateUpload.ts does it: checked here first, then
 * a one-time upload link so the file goes straight to storage from their
 * phone, then recorded as waiting on the office. Every check runs as the
 * service role against candidates.user_id — the candidate's own account has
 * no organisation and can read nothing of the company's.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Admin = ReturnType<typeof createAdminClient>;

async function ownStep(admin: Admin, userId: string, candidateId: string, step: string) {
  const { data: c } = await admin
    .from("candidates")
    .select("id, organisation_id, user_id, status, dbs_conviction")
    .eq("id", candidateId)
    .maybeSingle();
  if (!c || c.user_id !== userId || c.status !== "candidate") return "That isn't one of your applications.";
  const [{ data: docs }, { data: settingsRow }] = await Promise.all([
    admin.from("candidate_documents").select("doc_type, file_path, expires_at, not_required, review_status").eq("candidate_id", candidateId),
    admin.from("recruitment_settings").select("*").eq("organisation_id", c.organisation_id as string).maybeSingle(),
  ]);
  const stages = progress((docs ?? []) as CandidateDocRecord[], settingsFromRow(settingsRow), { dbsConviction: c.dbs_conviction === true });
  const s = stages.flatMap((x) => x.steps).find((x) => x.key === step);
  if (!s || !s.candidateUploads) return "The office does this step, so there's nothing for you to upload.";
  if (s.locked) return "This step isn't open yet.";
  if (s.state === "confirmed" || s.state === "not_needed") return "This has already been checked. Contact the office if it needs changing.";
  return { candidate: c, previous: (docs ?? []).find((d) => d.doc_type === step) };
}

export async function startCandidateUploadAction(
  candidateId: string,
  step: string,
  file: { name: string; size: number; type: string },
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const context = await requireCandidate();
  if (!file?.name?.trim()) return { ok: false, error: "Choose a file first." };
  if (!(file.size > 0)) return { ok: false, error: "That file looks empty. Try again." };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `That file is ${(file.size / 1048576).toFixed(1)}MB. The limit is 10MB: take the photo again at a smaller size, or scan it to PDF.` };
  }
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, error: "Upload a photo (JPG or PNG) or a PDF." };
  const admin = createAdminClient();
  const own = await ownStep(admin, context.userId, candidateId, step);
  if (typeof own === "string") return { ok: false, error: own };
  const path = `${own.candidate.organisation_id}/${candidateId}/${step}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { data, error } = await admin.storage.from("candidate-docs").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "The upload couldn't start. Try again." };
  return { ok: true, path: data.path, token: data.token };
}

export async function finishCandidateUploadAction(
  candidateId: string,
  step: string,
  path: string,
  fileName: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireCandidate();
  const admin = createAdminClient();
  const own = await ownStep(admin, context.userId, candidateId, step);
  if (typeof own === "string") return { ok: false, error: own };
  // Only a path we issued for this candidate and step is recorded.
  const prefix = `${own.candidate.organisation_id}/${candidateId}/${step}-`;
  if (!path.startsWith(prefix) || path.includes("..")) return { ok: false, error: "That upload didn't match. Try again." };
  const { error } = await admin.from("candidate_documents").upsert(
    {
      candidate_id: candidateId,
      organisation_id: own.candidate.organisation_id,
      doc_type: step,
      file_path: path,
      file_name: fileName.slice(0, 200),
      expires_at: null,
      not_required: false,
      not_required_reason: null,
      review_status: "submitted",
      review_note: null,
      uploaded_by_candidate: true,
      reviewed_by: null,
      reviewed_at: null,
    },
    { onConflict: "candidate_id,doc_type" },
  );
  if (error) return { ok: false, error: "Your file couldn't be saved. Try again." };
  const old = own.previous?.file_path as string | null | undefined;
  if (old && old !== path) await admin.storage.from("candidate-docs").remove([old]);
  revalidatePath("/my-application");
  return { ok: true };
}

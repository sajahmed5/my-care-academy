"use server";

import { revalidatePath } from "next/cache";
import { assertActiveMember, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { loadAssignment, pruneAnswers, validateAnswers } from "@/lib/form-library";

export interface SubmitState {
  ok?: boolean;
  error?: string;
  /** Required fields left empty, by label, so the form can point at them. */
  missing?: string[];
}

/**
 * Complete a form.
 *
 * The response is the carer's own: the insert runs as them and
 * form_responses_own_insert permits no other user_id, which is what makes it
 * evidence rather than a form somebody filled in with their name on it. The
 * assignment is then marked done by the same person, through the one update
 * a carer is allowed on that table.
 *
 * Answers are validated against the template's fields as they are now, and
 * pruned to them: a hidden conditional field's answer is not kept, and a
 * field the form does not have is not smuggled in.
 */
export async function submitFormResponseAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const context = await requireUser();
  if (!context.organisationId) return { ok: false, error: "Only a member of an organisation can complete a form." };
  await assertActiveMember(context);

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const signedName = String(formData.get("signedName") ?? "").trim();
  let answers: Record<string, unknown> = {};
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}"));
  } catch {
    return { ok: false, error: "The answers could not be read. Try again." };
  }
  if (!assignmentId) return { ok: false, error: "No form given." };

  const supabase = await createClient();
  const assignment = await loadAssignment(supabase, assignmentId);
  if (!assignment) return { ok: false, error: "That form is no longer assigned to you." };
  if (assignment.user_id !== context.userId) return { ok: false, error: "That form is not yours." };
  if (assignment.completed_at) return { ok: false, error: "You have already completed this form." };

  const fields = assignment.template.fields;
  // A signature field is satisfied by the typed name.
  for (const f of fields) if (f.type === "signature" && signedName) answers[f.id] = signedName;

  // A file field's answer is the stored file. The browser sends the file
  // itself beside the answers; it goes into the private form-uploads bucket,
  // as the service role, once the assignment is known to be this person's.
  const uploaded: string[] = [];
  const admin = createAdminClient();
  for (const f of fields) {
    if (f.type !== "file") continue;
    const file = formData.get(`file_${f.id}`);
    if (!(file instanceof File) || file.size === 0) {
      delete answers[f.id];
      continue;
    }
    if (file.size > 3 * 1024 * 1024) return { ok: false, error: `${f.label}: keep the file under 3 MB.` };
    if (!/^(image\/|application\/pdf$)/.test(file.type)) return { ok: false, error: `${f.label}: use a photo or a PDF.` };
    const path = `${context.organisationId}/library/${assignmentId}/${f.id}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\- ]+/g, "")}`;
    const { error: upErr } = await admin.storage
      .from("form-uploads")
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (upErr) return { ok: false, error: `${f.label}: ${upErr.message}` };
    uploaded.push(path);
    answers[f.id] = { file: path, name: file.name };
  }
  const discardUploads = () => (uploaded.length ? admin.storage.from("form-uploads").remove(uploaded) : undefined);

  const problems = validateAnswers(fields, answers);
  if (problems.length) {
    await discardUploads();
    return { ok: false, error: "Some required answers are missing.", missing: problems.map((p) => p.label) };
  }

  const { error } = await supabase.from("form_responses").insert({
    assignment_id: assignmentId,
    organisation_id: context.organisationId,
    template_id: assignment.template_id,
    template_version: assignment.template.version,
    user_id: context.userId,
    answers: pruneAnswers(fields, answers),
    signed_name: signedName || null,
  });
  if (error) {
    await discardUploads();
    return { ok: false, error: error.message };
  }

  const { error: doneError } = await supabase
    .from("form_assignments")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (doneError) {
    // The response is kept; the ask just has not been ticked. A manager can
    // see both, so nothing is lost — but say so.
    return { ok: false, error: `Your answers were saved, but the form could not be marked done: ${doneError.message}` };
  }

  await logAudit({
    context,
    action: "form.completed",
    entity: "form_assignment",
    entityId: assignmentId,
    detail: { template: assignment.template_code, version: assignment.template.version },
  });

  revalidatePath("/learn/forms");
  revalidatePath("/org/forms");
  revalidatePath(`/org/forms/library/${encodeURIComponent(assignment.template_code)}`);
  revalidatePath(`/org/staff/${context.userId}`);
  return { ok: true };
}

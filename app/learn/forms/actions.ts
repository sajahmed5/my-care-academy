"use server";

import { revalidatePath } from "next/cache";
import { assertActiveMember, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { loadAssignment, pruneAnswers, validateAnswers } from "@/lib/form-library";
import { discardFormFiles, storeFormFiles } from "@/lib/form-uploads";
import { defaultReviewDue } from "@/lib/form-reviews";

export interface SubmitState {
  ok?: boolean;
  error?: string;
  /** Required fields left empty, by label, so the form can point at them. */
  missing?: string[];
  /** Where the saved record can be read back, when there is a page for it. */
  href?: string;
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

  // Files go into the private bucket once the ask is known to be theirs.
  const admin = createAdminClient();
  const stored = await storeFormFiles(admin, formData, fields, answers, `${context.organisationId}/library/${assignmentId}`);
  if (stored.error) return { ok: false, error: stored.error };
  const discardUploads = () => discardFormFiles(admin, stored.uploaded);

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
    // A carer form that needs reviewing is due again after its period.
    review_due: defaultReviewDue(new Date(), assignment.template.review_months),
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

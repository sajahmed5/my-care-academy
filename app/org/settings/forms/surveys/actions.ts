"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { cleanQuestions, surveyKind } from "@/lib/feedback";
import type { SaveState } from "@/app/platform/actions";

/**
 * A company's wording for one of its surveys (FORMS.md, "Editable
 * questions"). Manager-only. Rounds already started keep the questions they
 * were sent with; the next round takes these.
 */
export async function saveSurveyQuestionsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("org_admin");
  if (!(await hasFeature(context, "quality.feedback"))) redirect("/org/settings");
  const kind = surveyKind(String(formData.get("kind") ?? ""));
  if (!kind) return { ok: false, error: "Unknown survey." };
  let questions;
  try {
    questions = cleanQuestions(JSON.parse(String(formData.get("questions") ?? "[]")));
  } catch {
    return { ok: false, error: "The questions could not be read." };
  }
  if (!questions) return { ok: false, error: "Keep at least one 1–5 rating question." };
  const supabase = await createClient();
  const { error } = await supabase.from("organisation_feedback_questions").upsert(
    { organisation_id: context.organisationId, kind: kind.key, questions, updated_by: context.userId, updated_at: new Date().toISOString() },
    { onConflict: "organisation_id,kind" },
  );
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "feedback.questions_saved", entity: "organisation", entityId: context.organisationId!, detail: { kind: kind.key, count: questions.length } });
  revalidatePath("/org/settings/forms/surveys");
  return { ok: true };
}

/** Go back to our wording for one survey. */
export async function resetSurveyQuestionsAction(formData: FormData): Promise<void> {
  const context = await requireRole("org_admin");
  const kind = surveyKind(String(formData.get("kind") ?? ""));
  if (!kind) return;
  const supabase = await createClient();
  await supabase.from("organisation_feedback_questions").delete().eq("organisation_id", context.organisationId!).eq("kind", kind.key);
  await logAudit({ context, action: "feedback.questions_reset", entity: "organisation", entityId: context.organisationId!, detail: { kind: kind.key } });
  revalidatePath("/org/settings/forms/surveys");
}

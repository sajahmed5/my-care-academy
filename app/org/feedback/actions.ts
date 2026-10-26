"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { surveyKind } from "@/lib/feedback";
import type { SaveState } from "@/app/platform/actions";

/** Create a survey link to send to families, service users or staff. */
export async function createSurveyAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "quality.feedback"))) return { ok: false, error: "Feedback surveys are not included in your plan." };
  const kind = surveyKind(String(formData.get("kind") ?? ""));
  if (!kind) return { ok: false, error: "Pick who the survey is for." };
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_surveys")
    .insert({
      organisation_id: context.organisationId,
      kind: kind.key,
      title: title || null,
      // The whole address: long and random, so a link cannot be guessed.
      token: crypto.randomBytes(24).toString("base64url"),
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "feedback.survey_created", entity: "feedback_survey", entityId: data.id as string, detail: { kind: kind.key } });
  revalidatePath("/org/feedback");
  redirect(`/org/feedback/${data.id}`);
}

/** Open or close a survey link. A closed link says so and takes no answers. */
export async function setSurveyOpenAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  const id = String(formData.get("id") ?? "");
  const open = formData.get("open") === "1";
  const supabase = await createClient();
  const { error } = await supabase.from("feedback_surveys").update({ is_open: open }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: open ? "feedback.survey_opened" : "feedback.survey_closed", entity: "feedback_survey", entityId: id });
  revalidatePath(`/org/feedback/${id}`);
  revalidatePath("/org/feedback");
  return { ok: true };
}

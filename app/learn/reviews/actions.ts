"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SaveState } from "@/app/platform/actions";

/**
 * Save an appraisal self-assessment, or send it to the manager. Only the
 * answers can change (a column grant), only on their own, and only while the
 * appraisal is still booked (the own-update policy) — so RLS is the gate and
 * this checks nothing it would not.
 */
export async function saveSelfAssessmentAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const send = formData.get("send") === "1";
  let answers: Record<string, string> = {};
  try {
    const raw = JSON.parse(String(formData.get("answers") ?? "{}"));
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) if (typeof v === "string") answers[k.slice(0, 60)] = v.slice(0, 5000);
    }
  } catch {
    answers = {};
  }
  if (send && !Object.values(answers).some((v) => v.trim())) {
    return { ok: false, error: "Answer at least one question before you send it." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appraisal_self_assessments")
    .update({ answers, ...(send ? { submitted_at: new Date().toISOString() } : {}) })
    .eq("id", id)
    .eq("user_id", context.userId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "This appraisal has already been held, so the self-assessment is closed." };
  revalidatePath("/learn/reviews");
  return { ok: true };
}

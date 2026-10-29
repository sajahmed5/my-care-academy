"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { CUSTOM_FORMS, MAX_CUSTOM, sanitiseCustomQuestions, type CustomForm } from "@/lib/custom-questions";
import { INTERVIEW_QUESTIONS } from "@/lib/recruitment-interview";
import { literacySettingsProblems, sanitiseLiteracySettings } from "@/lib/literacy-test";
import { sanitiseLetterSettings } from "@/lib/recruitment-letters";

/**
 * A company's own questions, literacy test and letter wording (RECRUITMENT.md,
 * release 7). Managers only; each is checked here, whatever the page sent.
 */

type Result = { ok: boolean; error?: string };

async function save(column: string, value: unknown, action: string, detail: Record<string, unknown>): Promise<Result> {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const admin = createAdminClient();
  const { error } = await admin
    .from("recruitment_settings")
    .upsert({ organisation_id: context.organisationId, [column]: value, updated_by: context.userId }, { onConflict: "organisation_id" });
  if (error) return { ok: false, error: "That couldn't be saved. Try again." };
  await logAudit({ context, action, entity: "organisation", entityId: context.organisationId!, detail });
  revalidatePath("/org/recruitment/forms");
  return { ok: true };
}

export async function saveCustomQuestionsAction(form: string, questions: unknown): Promise<Result> {
  if (!(CUSTOM_FORMS as string[]).includes(form)) return { ok: false, error: "Unknown form." };
  const context = await requireRole("org_admin");
  const admin = createAdminClient();
  const { data } = await admin.from("recruitment_settings").select("custom_questions").eq("organisation_id", context.organisationId!).maybeSingle();
  const current = sanitiseCustomQuestions(data?.custom_questions);
  const next = sanitiseCustomQuestions({ ...current, [form]: questions })[form as CustomForm];
  if (next.filter((q) => !q.retired).length > MAX_CUSTOM) return { ok: false, error: `Up to ${MAX_CUSTOM} questions on each form.` };
  // A question that was there before is never dropped, only retired, so its answers stay readable.
  const kept = current[form as CustomForm].filter((q) => !next.some((n) => n.id === q.id)).map((q) => ({ ...q, retired: true }));
  return save("custom_questions", { ...current, [form]: [...next, ...kept] }, "recruitment.questions_saved", { form, live: next.filter((q) => !q.retired).length });
}

export async function saveInterviewHiddenAction(hidden: string[]): Promise<Result> {
  const ids = new Set(INTERVIEW_QUESTIONS.map((q) => q.id));
  const clean = (Array.isArray(hidden) ? hidden : []).filter((h) => typeof h === "string" && ids.has(h));
  return save("interview_hidden", clean, "recruitment.interview_questions_saved", { hidden: clean.length });
}

export async function saveLiteracySettingsAction(raw: unknown): Promise<Result> {
  const settings = sanitiseLiteracySettings(raw);
  const problems = literacySettingsProblems(settings);
  if (problems.length) return { ok: false, error: problems.join(" ") };
  return save("literacy_settings", settings, "recruitment.literacy_saved", { minutes: settings.minutes, pass: settings.passPercent, off: settings.off.length, own: settings.own.length });
}

export async function saveLetterSettingsAction(raw: unknown): Promise<Result> {
  const settings = sanitiseLetterSettings(raw);
  return save("letter_settings", settings, "recruitment.letters_saved", { reasonsOff: settings.reasonsOff.length, own: settings.ownReasons.length, conditions: settings.conditions.length });
}

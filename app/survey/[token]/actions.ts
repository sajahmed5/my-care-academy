"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cleanSurveyAnswers, surveyKind } from "@/lib/feedback";

export interface SurveySubmitState {
  ok?: boolean;
  error?: string;
}

/**
 * One set of answers to a feedback survey, from someone with no account.
 * Written as the service role — anon has no privilege on any table — after
 * checking the token names a real, open survey. Anonymous: nothing about the
 * person is kept. A filled-in hidden field marks a bot and is quietly dropped.
 */
export async function submitSurveyAction(_prev: SurveySubmitState, formData: FormData): Promise<SurveySubmitState> {
  if (String(formData.get("website") ?? "")) return { ok: true };
  const token = String(formData.get("token") ?? "");
  const admin = createAdminClient();
  const { data: survey } = await admin
    .from("feedback_surveys")
    .select("id, organisation_id, kind, is_open")
    .eq("token", token)
    .maybeSingle();
  if (!survey || !survey.is_open) return { ok: false, error: "This survey has closed." };
  const kind = surveyKind(survey.kind as string);
  if (!kind) return { ok: false, error: "This survey is not available." };

  const raw: Record<string, unknown> = {};
  for (const q of kind.questions) raw[q.id] = formData.get(q.id);
  const answers = cleanSurveyAnswers(kind, raw);
  if (!answers) return { ok: false, error: "Please give at least one rating before sending." };

  const { error } = await admin
    .from("feedback_responses")
    .insert({ survey_id: survey.id, organisation_id: survey.organisation_id, answers });
  if (error) return { ok: false, error: "Your answers could not be saved. Please try again." };
  return { ok: true };
}

"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cleanSurveyAnswers } from "@/lib/feedback";
import { resolveSurveyToken } from "./load";

export interface SurveySubmitState {
  ok?: boolean;
  error?: string;
}

/**
 * One set of answers to a feedback survey, from someone with no account.
 * Written as the service role — anon has no privilege on any table — after
 * checking the token names a real, open round. A filled-in hidden field marks
 * a bot and is quietly dropped.
 *
 * From a personal link the invitation is marked answered, once. On a named
 * round the answer is linked to the client; on an anonymous one it is not
 * linked to the invitation at all and keeps only the day it came in, so who
 * answered can be counted but never matched to what they said.
 */
export async function submitSurveyAction(_prev: SurveySubmitState, formData: FormData): Promise<SurveySubmitState> {
  if (String(formData.get("website") ?? "")) return { ok: true };
  const admin = createAdminClient();
  const resolved = await resolveSurveyToken(admin, String(formData.get("token") ?? ""));
  if (!resolved || !resolved.survey.open) return { ok: false, error: "This survey has closed." };
  const { survey, questions, invitation } = resolved;
  if (invitation?.responded) return { ok: false, error: "You have already answered — thank you." };

  const raw: Record<string, unknown> = {};
  for (const q of questions) raw[q.id] = formData.get(q.id);
  const answers = cleanSurveyAnswers({ questions }, raw);
  if (!answers) return { ok: false, error: "Please give at least one rating before sending." };

  // Claim the invitation first, so a double click cannot answer twice.
  if (invitation) {
    const { data: claimed } = await admin
      .from("feedback_invitations")
      .update({ responded: true })
      .eq("id", invitation.id)
      .eq("responded", false)
      .select("id");
    if (!claimed?.length) return { ok: false, error: "You have already answered — thank you." };
  }

  const named = survey.named && invitation !== null;
  const { error } = await admin.from("feedback_responses").insert({
    survey_id: survey.id,
    organisation_id: survey.organisation_id,
    answers,
    ...(named
      ? { client_id: invitation!.client_id, invitation_id: invitation!.id, respondent_name: invitation!.name }
      : { submitted_at: `${new Date().toISOString().slice(0, 10)}T12:00:00Z` }),
  });
  if (error) {
    if (invitation) await admin.from("feedback_invitations").update({ responded: false }).eq("id", invitation.id);
    return { ok: false, error: "Your answers could not be saved. Please try again." };
  }
  return { ok: true };
}

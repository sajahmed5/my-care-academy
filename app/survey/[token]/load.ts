import type { SupabaseClient } from "@supabase/supabase-js";
import { questionsForRound, surveyKind, type SurveyKind, type SurveyQuestion } from "@/lib/feedback";

export interface ResolvedSurvey {
  survey: {
    id: string;
    organisation_id: string;
    kind: SurveyKind;
    title: string | null;
    named: boolean;
    open: boolean;
    closes_on: string | null;
  };
  questions: SurveyQuestion[];
  /** Set when the address is one person's own link. */
  invitation: { id: string; client_id: string | null; name: string | null; responded: boolean } | null;
}

/**
 * The token in the address is either a round's open link (printed as a QR
 * code, shared by text) or one person's own link from an email. Read as the
 * service role — anon reads no table. A round past its closing date is
 * closed, whatever its switch says.
 */
export async function resolveSurveyToken(admin: SupabaseClient, token: string): Promise<ResolvedSurvey | null> {
  if (!token || token.length < 24) return null;
  const cols = "id, organisation_id, kind, title, is_open, named, closes_on, questions";
  let invitation: ResolvedSurvey["invitation"] = null;
  let { data: s } = await admin.from("feedback_surveys").select(cols).eq("token", token).maybeSingle();
  if (!s) {
    const { data: inv } = await admin
      .from("feedback_invitations")
      .select("id, client_id, name, responded, survey_id")
      .eq("token", token)
      .maybeSingle();
    if (!inv) return null;
    invitation = { id: inv.id as string, client_id: (inv.client_id as string | null) ?? null, name: (inv.name as string | null) ?? null, responded: inv.responded === true };
    ({ data: s } = await admin.from("feedback_surveys").select(cols).eq("id", inv.survey_id as string).maybeSingle());
  }
  const kind = s ? surveyKind(s.kind as string) : undefined;
  if (!s || !kind) return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const closesOn = (s.closes_on as string | null) ?? null;
  return {
    survey: {
      id: s.id as string,
      organisation_id: s.organisation_id as string,
      kind,
      title: (s.title as string | null) ?? null,
      named: s.named === true,
      open: s.is_open === true && (!closesOn || closesOn >= today),
      closes_on: closesOn,
    },
    questions: questionsForRound(s),
    invitation,
  };
}

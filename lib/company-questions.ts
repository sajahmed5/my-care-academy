import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitiseCustomQuestions, type CustomQuestions } from "@/lib/custom-questions";
import { interviewHiddenOf } from "@/lib/recruitment-interview";

type Admin = ReturnType<typeof createAdminClient>;

/** A company's own questions and the interview questions it leaves out (RECRUITMENT.md, release 7). */
export async function companyQuestions(admin: Admin, orgId: string): Promise<{ custom: CustomQuestions; interviewHidden: string[] }> {
  const { data } = await admin.from("recruitment_settings").select("custom_questions, interview_hidden").eq("organisation_id", orgId).maybeSingle();
  return {
    custom: sanitiseCustomQuestions(data?.custom_questions),
    interviewHidden: interviewHiddenOf(data?.interview_hidden),
  };
}

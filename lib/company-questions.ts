import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitiseCustomQuestions, type CustomQuestions } from "@/lib/custom-questions";
import { interviewHiddenOf } from "@/lib/recruitment-interview";
import { jobTitlesOf } from "@/lib/recruitment";

type Admin = ReturnType<typeof createAdminClient>;

/** A company's own questions, the interview questions it leaves out (RECRUITMENT.md, release 7) and its job titles. */
export async function companyQuestions(admin: Admin, orgId: string): Promise<{ custom: CustomQuestions; interviewHidden: string[]; jobTitles: string[] }> {
  const { data } = await admin.from("recruitment_settings").select("custom_questions, interview_hidden, job_titles").eq("organisation_id", orgId).maybeSingle();
  return {
    custom: sanitiseCustomQuestions(data?.custom_questions),
    interviewHidden: interviewHiddenOf(data?.interview_hidden),
    jobTitles: jobTitlesOf(data?.job_titles),
  };
}

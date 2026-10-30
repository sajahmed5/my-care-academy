import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { CUSTOM_FORMS, CUSTOM_FORM_LABELS, sanitiseCustomQuestions } from "@/lib/custom-questions";
import { INTERVIEW_QUESTIONS, interviewHiddenOf } from "@/lib/recruitment-interview";
import { LITERACY_QUESTIONS, MIN_MARKS, sanitiseLiteracySettings } from "@/lib/literacy-test";
import { REJECTION_REASONS, defaultConditions, sanitiseLetterSettings } from "@/lib/recruitment-letters";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { InterviewQuestionsPicker, QuestionsEditor } from "./questions-editor";
import { TestEditor } from "./test-editor";
import { LettersEditor } from "./letters-editor";

const WHERE: Record<string, string> = {
  application: "Shown to the candidate before the declaration, after our questions.",
  interview: "Added to the interview record, after our questions.",
  reference: "Shown to every referee, before they give their own details.",
  dbs_risk: "Added to the DBS risk assessment, before the decision.",
};

/**
 * A company's own questions, literacy test and letter wording (RECRUITMENT.md,
 * release 7). Our questions stay: the application's checks and the offer
 * letter depend on them. Managers only, under Settings.
 */
export default async function RecruitmentFormsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const { data } = await supabase
    .from("recruitment_settings")
    .select("custom_questions, interview_hidden, literacy_settings, letter_settings")
    .eq("organisation_id", context.organisationId!)
    .maybeSingle();
  const custom = sanitiseCustomQuestions(data?.custom_questions);
  const canEdit = true;
  const card = "rounded-2xl border bg-card p-5";

  return (
    <SettingsShell context={context} active="/org/settings/recruitment/forms">
      <div className="max-w-3xl space-y-5">
        {CUSTOM_FORMS.map((form) => (
          <section key={form} aria-labelledby={`f-${form}`} className={card}>
            <h2 id={`f-${form}`} className="font-semibold">{CUSTOM_FORM_LABELS[form]}: your questions</h2>
            <p className="mb-3 mt-0.5 text-sm text-muted-foreground">{WHERE[form]}</p>
            <QuestionsEditor form={form} initial={custom[form]} canEdit={canEdit} />
            {form === "interview" && (
              <div className="mt-5 border-t pt-4">
                <h3 className="text-sm font-semibold">Our general questions you ask</h3>
                <p className="mb-2 mt-0.5 text-sm text-muted-foreground">We start you on four of these: with the six values questions that makes ten, enough for most interviews. Tick any others you want to ask too, or untick any you don&apos;t. The values questions always stay: the offer letter is written from them.</p>
                <InterviewQuestionsPicker questions={INTERVIEW_QUESTIONS.map((q) => ({ id: q.id, text: q.text }))} hidden={interviewHiddenOf(data?.interview_hidden)} canEdit={canEdit} />
              </div>
            )}
          </section>
        ))}
        <section aria-labelledby="f-test" className={card}>
          <h2 id="f-test" className="font-semibold">Literacy test</h2>
          <p className="mb-3 mt-0.5 text-sm text-muted-foreground">Marked automatically. Each candidate&apos;s test is fixed when it&apos;s unlocked.</p>
          <TestEditor
            initial={sanitiseLiteracySettings(data?.literacy_settings)}
            ours={LITERACY_QUESTIONS.map((q) => ({ id: q.id, prompt: q.prompt, marks: q.marks, type: q.type }))}
            minMarks={MIN_MARKS}
            canEdit={canEdit}
          />
        </section>
        <section aria-labelledby="f-letters" className={card}>
          <h2 id="f-letters" className="font-semibold">Letters</h2>
          <p className="mb-3 mt-0.5 text-sm text-muted-foreground">Who signs, hours and pay are under Settings.</p>
          <LettersEditor initial={sanitiseLetterSettings(data?.letter_settings)} ours={REJECTION_REASONS} defaultConditions={defaultConditions(2)} canEdit={canEdit} />
        </section>
      </div>
    </SettingsShell>
  );
}

import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SURVEY_KINDS, cleanQuestions } from "@/lib/feedback";
import { SettingsShell } from "../../settings-shell";
import { resetSurveyQuestionsAction } from "./actions";
import { QuestionsEditor } from "./questions-editor";

/**
 * Settings → Forms → Feedback surveys (FORMS.md, "Editable questions"): the
 * company's wording for its client and family survey and its staff survey,
 * starting from ours. Manager-only; a round already started keeps its own.
 */
export default async function SurveyWordingPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "quality.feedback");
  const supabase = await createClient();
  const { data } = await supabase
    .from("organisation_feedback_questions")
    .select("kind, questions")
    .eq("organisation_id", context.organisationId!);
  const own = new Map((data ?? []).map((r) => [r.kind as string, cleanQuestions(r.questions)]));

  return (
    <SettingsShell context={context} active="/org/settings/forms/surveys">
      {SURVEY_KINDS.map((k) => {
        const mine = own.get(k.key);
        return (
          <Card key={k.key}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{k.label}</h3>
                  <p className="text-xs text-muted-foreground">
                    {mine ? "Your own wording." : "Our wording — change any question, add your own, or take some out."}
                    {k.key === "staff" ? " Staff surveys are always anonymous." : ""}
                  </p>
                </div>
                {mine && (
                  <form action={resetSurveyQuestionsAction}>
                    <input type="hidden" name="kind" value={k.key} />
                    <Button type="submit" size="sm" variant="ghost">Go back to ours</Button>
                  </form>
                )}
              </div>
              <QuestionsEditor key={mine ? "own" : "ours"} kind={k.key} initial={mine ?? k.questions} />
            </CardContent>
          </Card>
        );
      })}
    </SettingsShell>
  );
}

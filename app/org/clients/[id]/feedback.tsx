import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { headlineQuestion, isLowScore, questionsForRound, surveyKind } from "@/lib/feedback";
import { formatDate } from "@/lib/dates";

/**
 * What the family said about this client on named feedback rounds (FORMS.md:
 * "a named one links to the client"), newest first. Shown only when there is
 * any; anonymous rounds never appear here.
 */
export async function ClientFeedback({ supabase, clientId }: { supabase: SupabaseClient; clientId: string }) {
  const { data } = await supabase
    .from("feedback_responses")
    .select("id, submitted_at, answers, respondent_name, complaint_id, survey:feedback_surveys (id, kind, title, questions)")
    .eq("client_id", clientId)
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (!data?.length) return null;
  return (
    <section id="feedback" className="scroll-mt-24 space-y-3">
      <h2 className="text-sm font-semibold">Feedback · {data.length}</h2>
      <ul className="divide-y rounded-xl border bg-card text-sm">
        {data.map((r) => {
          const s = (Array.isArray(r.survey) ? r.survey[0] : r.survey) as { id: string; kind: string; title: string | null; questions: unknown };
          const questions = questionsForRound(s);
          const answers = r.answers as Record<string, number | string>;
          const head = headlineQuestion(questions);
          const low = isLowScore(questions, answers);
          return (
            <li key={r.id as string} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
              <span>
                <Link href={`/org/feedback/${s.id}`} className="font-medium hover:underline">
                  {s.title || surveyKind(s.kind)?.label}
                </Link>
                <span className="text-muted-foreground">
                  {r.respondent_name ? ` · from ${r.respondent_name as string}` : ""}
                  {head && typeof answers[head.id] === "number" ? ` · ${head.text.replace(/\?$/, "")}: ${answers[head.id]}/5` : ""}
                </span>
                {low && !r.complaint_id && <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700">Low score</span>}
              </span>
              <span className="text-xs text-muted-foreground">{formatDate(r.submitted_at as string, { day: "numeric", month: "short", year: "numeric" })}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

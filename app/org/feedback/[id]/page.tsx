import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Printer, QrCode } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  averages,
  headlineQuestion,
  isLowScore,
  isPraise,
  monthlyTrend,
  questionsForRound,
  responseRate,
  surveyKind,
  type SurveyResponseRow,
} from "@/lib/feedback";
import { siteOrigin } from "@/lib/site-url";
import { formatDate } from "@/lib/dates";
import { fetchAll } from "@/lib/fetch-all";
import { logComplimentFromFeedbackAction, raiseConcernFromFeedbackAction } from "../actions";
import { ActionLine, CopyLink, OpenToggle, SentToCount } from "../controls";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

type Row = SurveyResponseRow & {
  id: string;
  client_id: string | null;
  respondent_name: string | null;
  complaint_id: string | null;
  compliment_id: string | null;
  client: { full_name: string } | { full_name: string }[] | null;
};

/**
 * One round: how to send it, how many have answered, and what they said —
 * averages, the trend, comments. On a named round each answer shows who it
 * came from, with a low score raised as a concern, or praise logged as a
 * compliment, in one click. Then "you said, we did".
 */
export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.feedback");
  const { id } = await params;
  const supabase = await createClient();
  const { data: survey } = await supabase
    .from("feedback_surveys")
    .select("id, kind, title, token, is_open, named, closes_on, sent_to_count, questions, created_at")
    .eq("id", id)
    .maybeSingle();
  const kind = survey ? surveyKind(survey.kind as string) : undefined;
  if (!survey || !kind) notFound();
  const questions = questionsForRound(survey);
  const [rows, { data: invitations }, { data: actions }, origin, complaintsOn] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from("feedback_responses")
        .select("id, submitted_at, answers, client_id, respondent_name, complaint_id, compliment_id, client:clients (full_name)")
        .eq("survey_id", id)
        .order("id")
        .range(f, t),
    ),
    supabase.from("feedback_invitations").select("id, responded").eq("survey_id", id).limit(5000),
    supabase.from("feedback_actions").select("id, you_said, we_did").eq("survey_id", id).order("created_at").limit(200),
    siteOrigin(),
    hasFeature(context, "complaints.register"),
  ]);
  const responses = rows as unknown as Row[];
  const avgs = averages({ questions }, responses);
  const headline = headlineQuestion(questions);
  const trend = headline ? monthlyTrend(responses, headline.id) : [];
  const invitedCount = (invitations ?? []).length;
  const answeredInvites = (invitations ?? []).filter((i) => i.responded).length;
  const rate = responseRate({ invited: invitedCount, sentTo: (survey.sent_to_count as number | null) ?? null, responses: responses.length });
  const comments = questions
    .filter((q) => q.type === "text")
    .map((q) => ({
      q,
      items: responses
        .filter((r) => typeof r.answers[q.id] === "string")
        .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
        .slice(0, 50)
        .map((r) => ({ at: r.submitted_at, text: r.answers[q.id] as string, who: survey.named ? r.respondent_name : null })),
    }));
  const named = survey.named === true ? responses.filter((r) => r.client_id).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)) : [];
  const clientName = (r: Row) => (Array.isArray(r.client) ? r.client[0]?.full_name : r.client?.full_name) ?? "Client no longer on the list";

  return (
    <DashboardShell title={(survey.title as string | null) || kind.label} context={context} back={{ href: "/org/feedback", label: "Feedback" }}>
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {kind.label} · {survey.named ? "named" : "anonymous"} · {survey.is_open ? "open — taking answers" : "closed"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Started {fmt(survey.created_at as string)}
                  {survey.closes_on ? ` · closes ${fmt(survey.closes_on as string)}` : ""}
                </p>
              </div>
              <OpenToggle id={survey.id as string} open={survey.is_open as boolean} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href={`/org/feedback/${survey.id}/send`} className={buttonVariants()}>
                <Mail className="size-4" />
                {kind.key === "client" ? "Email families from the client list" : "Email your staff"}
              </Link>
              <Link href={`/org/feedback/${survey.id}/poster`} className={buttonVariants({ variant: "outline" })}>
                <QrCode className="size-4" />
                Print a QR code
              </Link>
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                The open link — anyone with it can answer{survey.named ? ", anonymously (only emailed links are named)" : ""}
              </p>
              <CopyLink url={`${origin}/survey/${survey.token}`} />
              <SentToCount id={survey.id as string} value={(survey.sent_to_count as number | null) ?? null} />
            </div>
          </CardContent>
        </Card>

        <p className="text-sm">
          <span className="font-semibold">{responses.length}</span> response{responses.length === 1 ? "" : "s"}
          {rate && (
            <>
              {" "}
              of {rate.asked} asked — a <span className="font-semibold">{rate.percent}%</span> response rate
            </>
          )}
          {invitedCount > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · {answeredInvites} of {invitedCount} emailed have answered
            </span>
          )}
          <span className="text-muted-foreground">. Ratings run from 1 (very poor) to 5 (very good).</span>
        </p>

        <Card>
          <CardContent className="divide-y pt-6">
            {avgs.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{a.text}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {a.average !== null && (
                    <span className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-teal-500" style={{ width: `${(a.average / 5) * 100}%` }} />
                    </span>
                  )}
                  <span className="w-20 text-right text-xs text-muted-foreground">
                    {a.average !== null ? `${a.average} / 5 (${a.count})` : "No answers"}
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {trend.length > 1 && headline && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <p className="text-sm font-semibold">{headline.text} — month by month</p>
              <ul className="space-y-1 text-sm">
                {trend.map((t) => (
                  <li key={t.month} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-muted-foreground">{formatDate(`${t.month}-01`, { month: "short", year: "numeric" })}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${(t.average / 5) * 100}%` }} />
                    </span>
                    <span className="w-24 text-right text-xs text-muted-foreground">
                      {t.average} / 5 ({t.count})
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {named.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Who said what</h3>
            <Card>
              <CardContent className="divide-y p-0">
                {named.map((r) => {
                  const low = isLowScore(questions, r.answers);
                  const praise = isPraise(questions, r.answers);
                  const ratings = questions.filter((q) => q.type === "rating" && typeof r.answers[q.id] === "number");
                  return (
                    <div key={r.id} className="space-y-1 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <Link href={`/org/clients/${r.client_id}`} className="font-medium hover:underline">{clientName(r)}</Link>
                          <span className="text-xs text-muted-foreground">
                            {r.respondent_name ? ` · from ${r.respondent_name}` : ""} · {fmt(r.submitted_at)}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          {complaintsOn && r.complaint_id && (
                            <Link href={`/org/complaints/${r.complaint_id}`} className="text-xs font-medium text-rose-700 hover:underline">Concern raised</Link>
                          )}
                          {complaintsOn && !r.complaint_id && low && (
                            <form action={raiseConcernFromFeedbackAction}>
                              <input type="hidden" name="responseId" value={r.id} />
                              <Button type="submit" size="xs" variant="outline">Raise as a concern</Button>
                            </form>
                          )}
                          {complaintsOn && r.compliment_id && <span className="text-xs font-medium text-teal-700">Compliment logged</span>}
                          {complaintsOn && !r.compliment_id && praise && (
                            <form action={logComplimentFromFeedbackAction}>
                              <input type="hidden" name="responseId" value={r.id} />
                              <Button type="submit" size="xs" variant="outline">Log as a compliment</Button>
                            </form>
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ratings.map((q) => (
                          <span key={q.id} className={(r.answers[q.id] as number) <= 2 ? "font-semibold text-rose-700" : ""}>
                            {q.text.replace(/\?$/, "")}: {r.answers[q.id]}/5 ·{" "}
                          </span>
                        ))}
                      </p>
                      {questions
                        .filter((q) => q.type === "text" && typeof r.answers[q.id] === "string")
                        .map((q) => (
                          <p key={q.id} className="whitespace-pre-wrap">
                            <span className="text-muted-foreground">{q.text} </span>
                            {r.answers[q.id] as string}
                          </p>
                        ))}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>
        )}

        {comments.map(({ q, items }) =>
          items.length && !survey.named ? (
            <Card key={q.id}>
              <CardContent className="space-y-2 pt-6">
                <p className="text-sm font-semibold">{q.text}</p>
                <ul className="divide-y text-sm">
                  {items.map((c, i) => (
                    <li key={i} className="py-2">
                      <p className="whitespace-pre-wrap">{c.text}</p>
                      <p className="text-xs text-muted-foreground">{fmt(c.at)}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null,
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">You said, we did</h3>
              <p className="text-xs text-muted-foreground">What people told you, and what you have done about it — a one-page report to share.</p>
            </div>
            <Link href={`/org/feedback/${survey.id}/report`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Printer className="size-4" />
              The report
            </Link>
          </div>
          {(actions ?? []).map((a) => (
            <ActionLine key={a.id as string} surveyId={survey.id as string} line={{ id: a.id as string, you_said: a.you_said as string, we_did: (a.we_did as string | null) ?? null }} />
          ))}
          <ActionLine surveyId={survey.id as string} />
        </section>
      </div>
    </DashboardShell>
  );
}

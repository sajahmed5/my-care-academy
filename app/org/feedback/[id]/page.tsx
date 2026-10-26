import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { averages, monthlyTrend, surveyKind, type SurveyResponseRow } from "@/lib/feedback";
import { siteOrigin } from "@/lib/site-url";
import { formatDate } from "@/lib/dates";
import { fetchAll } from "@/lib/fetch-all";
import { CopyLink, OpenToggle } from "../controls";

/** One survey: its link, and what people said — averages, the trend, comments. */
export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.feedback");
  const { id } = await params;
  const supabase = await createClient();
  const { data: survey } = await supabase
    .from("feedback_surveys")
    .select("id, kind, title, token, is_open, created_at")
    .eq("id", id)
    .maybeSingle();
  const kind = survey ? surveyKind(survey.kind as string) : undefined;
  if (!survey || !kind) notFound();
  const [rows, origin] = await Promise.all([
    fetchAll((f, t) =>
      supabase.from("feedback_responses").select("id, submitted_at, answers").eq("survey_id", id).order("id").range(f, t),
    ),
    siteOrigin(),
  ]);
  const responses = rows as unknown as SurveyResponseRow[];
  const avgs = averages(kind, responses);
  const trend = monthlyTrend(responses);
  const comments = kind.questions
    .filter((q) => q.type === "text")
    .map((q) => ({
      q,
      items: responses
        .filter((r) => typeof r.answers[q.id] === "string")
        .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
        .slice(0, 50)
        .map((r) => ({ at: r.submitted_at, text: r.answers[q.id] as string })),
    }));
  const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

  return (
    <DashboardShell title={(survey.title as string | null) || kind.label} context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/org/feedback" className="text-sm text-muted-foreground hover:underline">
          ← Feedback
        </Link>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium">
              {kind.label} · {survey.is_open ? "open — taking answers" : "closed"}
            </p>
            <CopyLink url={`${origin}/survey/${survey.token}`} />
            <p className="text-xs text-muted-foreground">
              Send this link by text, email or a printed QR code. Anyone with it can answer, anonymously.
            </p>
            <OpenToggle id={survey.id as string} open={survey.is_open as boolean} />
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          {responses.length} response{responses.length === 1 ? "" : "s"}. Ratings run from 1 (very poor) to 5 (very good).
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

        {trend.length > 0 && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <p className="text-sm font-semibold">Overall rating, month by month</p>
              <ul className="space-y-1 text-sm">
                {trend.map((t) => (
                  <li key={t.month} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-muted-foreground">
                      {formatDate(`${t.month}-01`, { month: "short", year: "numeric" })}
                    </span>
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

        {comments.map(({ q, items }) =>
          items.length ? (
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
      </div>
    </DashboardShell>
  );
}

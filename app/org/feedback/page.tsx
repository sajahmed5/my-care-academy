import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { surveyKind } from "@/lib/feedback";
import { formatDate } from "@/lib/dates";
import { NewSurvey } from "./controls";

/** Feedback surveys (ROADMAP §4): the links sent out, and how many answered each. */
export default async function FeedbackPage() {
  const context = await requireConsole();
  await requireFeature(context, "quality.feedback");
  const supabase = await createClient();
  const { data: surveys } = await supabase
    .from("feedback_surveys")
    .select("id, kind, title, is_open, created_at, responses:feedback_responses (count)")
    .eq("organisation_id", context.organisationId!)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <DashboardShell title="Feedback" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Send a survey link to the people you care for and their families, or to your staff. They answer anonymously,
          without an account, and the results are averaged and trended here — evidence of listening that inspectors ask
          for.
        </p>
        <NewSurvey />
        {(surveys ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No surveys yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {(surveys ?? []).map((s) => {
                const count = ((s.responses as { count: number }[] | null)?.[0]?.count as number | undefined) ?? 0;
                return (
                  <Link
                    key={s.id as string}
                    href={`/org/feedback/${s.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span>
                      {(s.title as string | null) || surveyKind(s.kind as string)?.label}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {surveyKind(s.kind as string)?.label} · created {formatDate(s.created_at as string, { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{count} response{count === 1 ? "" : "s"}</span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${s.is_open ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {s.is_open ? "Open" : "Closed"}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

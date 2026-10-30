import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { responseRate, surveyKind } from "@/lib/feedback";
import { formatDate } from "@/lib/dates";
import { NewSurvey } from "./controls";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Feedback surveys (FORMS.md): each survey runs as a round — the annual
 * survey, say — sent by email to families from the client list or to staff,
 * or handed out as a printed QR code, with its response rate. Client rounds
 * can be anonymous or named; staff rounds are always anonymous.
 */
export default async function FeedbackPage() {
  const context = await requireConsole();
  await requireFeature(context, "quality.feedback");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [{ data: surveys }, invitations] = await Promise.all([
    supabase
      .from("feedback_surveys")
      .select("id, kind, title, is_open, named, closes_on, sent_to_count, created_at, responses:feedback_responses (count)")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
    fetchAll<{ id: string; survey_id: string }>((f, t) =>
      supabase.from("feedback_invitations").select("id, survey_id").eq("organisation_id", orgId).order("id").range(f, t),
    ),
  ]);
  const invited = new Map<string, number>();
  for (const i of invitations) invited.set(i.survey_id, (invited.get(i.survey_id) ?? 0) + 1);

  return (
    <DashboardShell title="Feedback" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Run a round of feedback from the people you care for and their families, or from your staff. Email it from your client
          list or staff list, or print a QR code; then read the results, act on them, and publish what you did.
          {context.role === "org_admin" && (
            <>
              {" "}
              <Link href="/org/settings/forms/surveys" className="text-primary hover:underline">Change the questions</Link>.
            </>
          )}
        </p>
        <Card>
          <CardContent className="pt-6">
            <NewSurvey />
          </CardContent>
        </Card>
        {(surveys ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">No rounds yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {(surveys ?? []).map((s) => {
                const count = ((s.responses as { count: number }[] | null)?.[0]?.count as number | undefined) ?? 0;
                const rate = responseRate({ invited: invited.get(s.id as string) ?? 0, sentTo: (s.sent_to_count as number | null) ?? null, responses: count });
                const kind = surveyKind(s.kind as string);
                return (
                  <Link
                    key={s.id as string}
                    href={`/org/feedback/${s.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{(s.title as string | null) || kind?.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {kind?.label} · {s.named ? "named" : "anonymous"} · started {fmt(s.created_at as string)}
                        {s.closes_on ? ` · closes ${fmt(s.closes_on as string)}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {count} response{count === 1 ? "" : "s"}
                        {rate ? ` of ${rate.asked} asked · ${rate.percent}%` : ""}
                      </span>
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

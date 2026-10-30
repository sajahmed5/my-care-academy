import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { PROBATION_STATUS_LABEL, outcomeLabel, probationFromRow, schedule, type ReviewRecord } from "@/lib/hr/probation";
import { templateFor } from "@/lib/hr/letters";
import { EmploymentForm, ProbationLine } from "./employment-forms";

const fmt = (d: string | null) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The Employment section's Probation page (HR-PACK.md): their start date and
 * job title, where probation stands, and each review — booked, held, or due.
 * Read under RLS: the section only renders when the company has the HR pack.
 */
export async function ProbationPanel({ supabase, userId, orgId }: { supabase: Supabase; userId: string; orgId: string }) {
  const [{ data: emp }, { data: settings }, { data: reviews }] = await Promise.all([
    supabase.from("staff_employment").select("start_date, job_title, probation_status, probation_ends_on").eq("user_id", userId).maybeSingle(),
    supabase.from("hr_settings").select("probation_months, probation_review_months").eq("organisation_id", orgId).maybeSingle(),
    supabase.from("probation_reviews").select("id, due_on, status, booked_on, booked_time, held_on, outcome, is_final").eq("user_id", userId).order("due_on"),
  ]);
  const s = probationFromRow(settings);
  const today = new Date().toISOString().slice(0, 10);
  const lines = emp && emp.probation_status !== "none" ? schedule(emp as never, s, (reviews ?? []) as ReviewRecord[], today) : [];
  const status = (emp?.probation_status as string | undefined) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <EmploymentForm
            userId={userId}
            startDate={(emp?.start_date as string | null) ?? ""}
            jobTitle={(emp?.job_title as string | null) ?? ""}
            noProbation={status === "none"}
          />
        </CardContent>
      </Card>
      {!emp?.start_date ? (
        <p className="text-sm text-muted-foreground">Set their start date and their probation reviews appear here, {s.reviewMonths.slice(0, -1).join(", ")} and {s.months} months in.</p>
      ) : status === "none" ? (
        <p className="text-sm text-muted-foreground">Not on probation.</p>
      ) : (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{PROBATION_STATUS_LABEL[status ?? "in_probation"]}</span>
            <span className="text-muted-foreground">
              {status === "passed" || status === "not_passed" ? "" : `Ends ${fmt(emp.probation_ends_on as string | null)}`}
            </span>
          </p>
          <Card>
            <CardContent className="divide-y p-0">
              {lines.map((l) => (
                <div key={l.dueOn} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{l.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Due {fmt(l.dueOn)}
                      {l.review?.booked_on && l.state !== "held" ? ` · booked ${fmt(l.review.booked_on)}${l.review.booked_time ? ` at ${l.review.booked_time}` : ""}` : ""}
                      {l.state === "held" ? ` · held ${fmt(l.review!.held_on)} · ${outcomeLabel(l.review!.outcome)}` : ""}
                    </p>
                  </div>
                  {l.state === "held" ? (
                    <Link href={`/org/hr/probation/review/${l.review!.id}`} className="text-sm font-medium text-primary hover:underline">
                      Read the review
                    </Link>
                  ) : l.state === "skipped" ? (
                    <span className="text-xs text-muted-foreground">Not held</span>
                  ) : (
                    <ProbationLine userId={userId} dueOn={l.dueOn} state={l.state} draft={l.review?.status === "draft"} bookedOn={l.review?.booked_on ?? null} />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Letters sent to them, and drafts waiting to be sent. */
export async function LettersPanel({ supabase, userId }: { supabase: Supabase; userId: string }) {
  const { data: letters } = await supabase
    .from("hr_letters")
    .select("id, kind, subject, status, sent_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!letters?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">No letters yet. Letters are written from a probation review, a case or their leaving.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {letters.map((l) => (
          <Link key={l.id as string} href={`/org/hr/letters/${l.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
            <span>
              <span className="font-medium">{l.subject as string}</span>
              <span className="ml-2 text-xs text-muted-foreground">{templateFor(l.kind as string)?.label ?? ""}</span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.status === "sent" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {l.status === "sent" ? `Sent ${fmt(l.sent_at as string)}` : "Draft: not sent"}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

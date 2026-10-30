import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { areaLabel, outcomeLabel as competencyOutcome, spotOutcomeLabel } from "@/lib/competency";
import type { Answers } from "@/lib/recruitment-application";
import { outcomeLabel, type ProbationFacts } from "@/lib/hr/probation";
import { hrPerson, personName } from "@/lib/hr/server";
import { ReviewForm } from "./review-form";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * A probation review: what the site already knows about them (training,
 * induction, spot checks, competency, supervisions), then conduct and
 * performance, then the outcome. The manager's record; the carer never reads it.
 */
export default async function ProbationReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const admin = createAdminClient();
  const { data: review } = await admin.from("probation_reviews").select("*").eq("id", id).maybeSingle();
  if (!review || review.organisation_id !== context.organisationId) notFound();
  const person = await hrPerson(admin, context.organisationId, review.user_id as string);
  if (!person) notFound();
  const facts = review.facts as ProbationFacts;
  const held = review.status === "held";
  const { data: letters } = held
    ? await admin.from("hr_letters").select("id, status").eq("source_type", "probation_review").eq("source_id", id)
    : { data: [] };

  return (
    <DashboardShell
      title={`${review.is_final ? "End of probation review" : "Probation review"}: ${personName(person)}`}
      context={context}
      back={{ href: `/org/staff/${person.id}?section=employment`, label: personName(person) }}
    >
      <div className="max-w-3xl space-y-5">
        <p className="text-sm text-muted-foreground">
          Due {fmt(review.due_on as string)}
          {review.booked_on ? ` · booked ${fmt(review.booked_on as string)}${review.booked_time ? ` at ${review.booked_time}` : ""}` : ""}
          {held ? ` · held ${fmt(review.held_on as string)} · ${outcomeLabel(review.outcome as string | null)}` : ""}
        </p>
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <p className="font-semibold">What the site knows</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>
                Induction (Care Certificate):{" "}
                {facts.induction ? `${facts.induction.done} of ${facts.induction.total} courses done` : "not started on the site"}
              </li>
              <li>
                Training: {facts.trainingCompleted} completed{facts.trainingOverdue ? `, ${facts.trainingOverdue} overdue` : ", none overdue"}
              </li>
              <li>Supervisions held: {facts.supervisions}</li>
              <li>
                Spot checks:{" "}
                {facts.spotChecks.length ? facts.spotChecks.map((s) => `${fmt(s.on)} ${spotOutcomeLabel(s.outcome)}`).join("; ") : "none recorded"}
              </li>
              <li>
                Competency:{" "}
                {facts.competency.length
                  ? facts.competency.map((c) => `${areaLabel(c.area)} ${competencyOutcome(c.outcome).toLowerCase()}`).join("; ")
                  : "none recorded"}
              </li>
            </ul>
          </CardContent>
        </Card>
        {held && review.outcome === "not_passed" && (
          <p className="text-sm">
            <a
              href={`/org/hr/cases/new?user=${person.id}&subtype=capability&from=probation&fromId=${id}&label=${encodeURIComponent("Probation not passed")}`}
              className="font-medium text-primary hover:underline"
            >
              Open a capability case for this
            </a>
          </p>
        )}
        <ReviewForm
          id={id}
          userId={person.id}
          isFinal={review.is_final as boolean}
          held={held}
          initial={(review.answers as Answers) ?? {}}
          initialOutcome={{ outcome: (review.outcome as string | null) ?? null, extendMonths: (review.extend_months as number | null) ?? null, reason: (review.outcome_reason as string | null) ?? "" }}
          letterIds={(letters ?? []).map((l) => l.id as string)}
        />
      </div>
    </DashboardShell>
  );
}

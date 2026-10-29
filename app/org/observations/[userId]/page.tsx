import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { loadLearnerCareCert } from "@/lib/observations";
import { DashboardShell } from "@/components/dashboard-shell";
import { ProgressRing } from "@/components/learner-ui";
import { StandardObservationRow } from "./standard-observation-row";
import { AwardPanel } from "./award-panel";

export default async function LearnerAssessmentPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const context = await requireConsole();
  const { userId } = await params;
  const supabase = await createClient();

  await requireFeature(context, "training.observations", "/org/observations");

  const learner = await loadLearnerCareCert(supabase, userId);
  if (!learner) notFound();

  const pct = learner.total
    ? Math.round((learner.observedCompetent / learner.total) * 100)
    : 0;

  return (
    <DashboardShell title="Care Certificate assessment" context={context}>
      <div className="space-y-6">
        <Link
          href="/org/observations"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All staff
        </Link>

        {/* Header: learner + observation progress */}
        <div className="flex flex-col items-center gap-6 rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:flex-row sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {learner.fullName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Knowledge {learner.knowledgeComplete}/{learner.total} · observed
              competent {learner.observedCompetent}/{learner.total}
            </p>
          </div>
          <ProgressRing value={pct} color="var(--primary)">
            <span className="text-2xl font-bold">{pct}%</span>
            <span className="text-xs text-muted-foreground">observed</span>
          </ProgressRing>
        </div>

        <AwardPanel
          userId={learner.userId}
          eligible={learner.eligibleToAward}
          signedOffAt={learner.signedOff?.signedAt ?? null}
        />

        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">
            The 16 standards
          </h3>
          {learner.standards.map((s) => (
            <StandardObservationRow
              key={s.standardNo}
              userId={learner.userId}
              standard={s}
            />
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

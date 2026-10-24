import { StatusKey } from "../../status-key";
import { requireConsole } from "@/lib/auth";
import {
  AssignedTrainingTable,
  TRAINING_TABS,
  type TrainingStatusFilter,
} from "../../assigned-training-table";

/**
 * Learners → Statistics: the assigned-training table, one row per learner ×
 * course. The per-learner table moved up to the Overview page (design doc v3);
 * this is where the assignment-level detail lives.
 */
export default async function LearnersStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const context = await requireConsole();
  const { status } = await searchParams;
  const trainingStatus: TrainingStatusFilter = TRAINING_TABS.some(
    (t) => t.key === status,
  )
    ? (status as TrainingStatusFilter)
    : "all";

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Assigned training
      </h2>
      <AssignedTrainingTable
        status={trainingStatus}
        baseHref="/org/learners/statistics"
        orgId={context.organisationId}
      />
      <StatusKey kind="training" />
    </section>
  );
}

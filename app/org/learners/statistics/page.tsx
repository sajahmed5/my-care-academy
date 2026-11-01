import { StatusKey } from "../../status-key";
import { requireConsole } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
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
    <DashboardShell title="Training matrix" context={context} back={{ href: "/org/learners", label: "Staff" }}>
    <section className="space-y-3">
      <p className="text-[15px] text-muted-foreground">Every course assigned to every person, with where each one stands.</p>
      <AssignedTrainingTable
        status={trainingStatus}
        baseHref="/org/learners/statistics"
        orgId={context.organisationId}
      />
      <StatusKey kind="training" />
    </section>
    </DashboardShell>
  );
}

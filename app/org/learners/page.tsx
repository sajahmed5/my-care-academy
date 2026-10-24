import {
  Users,
  MoonStar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Award,
  UserRoundX,
} from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/learner-ui";
import {
  bucketOf,
  isActiveLearner,
  isInactive30d,
  isNeverActive,
  loadOrgLearners,
} from "@/lib/org-learners";
import { formatDuration } from "@/lib/org-learner";
import { LearnersTable, type Filter } from "./learners-table";
import { MatrixExport } from "../matrix-export";

const FILTERS: Filter[] = [
  "all",
  "overdue",
  "in_progress",
  "not_started",
  "completed",
  "unassigned",
  "deactivated",
  "inactive",
  "never",
  "due_soon",
  "signed_in",
];

/**
 * Learners overview: the headline numbers over the per-learner table (design
 * doc v3). Every tile is a link back into this page with the matching filter
 * pre-selected, so a number and the people behind it are one click apart.
 */
export default async function LearnersOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const context = await requireConsole();
  const orgId = context.organisationId;
  const { filter } = await searchParams;
  const initialFilter: Filter = FILTERS.includes(filter as Filter)
    ? (filter as Filter)
    : "all";

  const supabase = await createClient();
  const [allRows, { data: organisation }] = await Promise.all([
    loadOrgLearners(supabase, orgId),
    supabase.from("organisations").select("name").eq("id", orgId!).single(),
  ]);

  // The tiles count active staff only; the table keeps deactivated accounts
  // for their training history, behind its own pill.
  const rows = allRows.filter(isActiveLearner);
  const nowMs = new Date().getTime();
  const assigned = rows.reduce((n, r) => n + r.stats.assigned, 0);
  const completed = rows.reduce((n, r) => n + r.stats.completed, 0);
  const overallPct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
  const inProgress = rows.filter((r) => bucketOf(r) === "in_progress").length;
  const withOverdue = rows.filter((r) => r.stats.overdue > 0).length;
  const inactive = rows.filter((r) => isInactive30d(r, nowMs)).length;
  // Never signed in is its own tile: these people are invisible to "Inactive
  // 30d+" by design, and without a tile of their own a whole untrained
  // workforce reads as green up here (issue #22).
  const neverActive = rows.filter(isNeverActive).length;
  // "Active" has to mean they have actually used the account (issue #24).
  // Counting everyone not deactivated made an org of people who had never
  // logged in read as fully active. This and the Never signed in tile now sum
  // to the roll rather than overlapping.
  const activeLearners = rows.length - neverActive;
  const learningSeconds = rows.reduce((n, r) => n + r.timeSpentSeconds, 0);
  const certificates = rows.reduce((n, r) => n + r.stats.certificates, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile
          label="Active learners"
          value={activeLearners}
          icon={Users}
          color="#0284c7"
          href="/org/learners#learners"
        />
        <StatTile
          label="Not signed in for a month"
          value={inactive}
          icon={MoonStar}
          color="#8b5cf6"
          href="/org/learners?filter=inactive#learners"
        />
        <StatTile
          label="In progress"
          value={inProgress}
          icon={Clock}
          color="#f59e0b"
          href="/org/learners?filter=in_progress#learners"
        />
        <StatTile
          label="With overdue"
          value={withOverdue}
          icon={AlertTriangle}
          color="#ef4444"
          href="/org/learners?filter=overdue#learners"
        />
        <StatTile
          label="Never signed in"
          value={neverActive}
          icon={UserRoundX}
          color="#e11d48"
          href="/org/learners?filter=never#learners"
        />
        <StatTile
          label="Assigned training complete"
          value={`${overallPct}%`}
          icon={CheckCircle2}
          color="#10b981"
          hint={`${completed} of ${assigned} courses`}
          href="/org/learners?filter=completed#learners"
        />
        <StatTile
          label="Learning hours"
          value={formatDuration(learningSeconds)}
          icon={Timer}
          color="#0d9488"
          href="/org/learners#learners"
        />
        <StatTile
          label="Certificates issued"
          value={certificates}
          icon={Award}
          color="#7c3aed"
          href="/org/learners#learners"
        />
      </div>

      <section id="learners" className="scroll-mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Learners
          </h2>
          <MatrixExport
            filename={`${organisation?.name ?? "org"}-training-matrix.csv`}
          />
        </div>
        {/* Keyed on the filter so a tile click re-selects the pill — the table
            holds its own filter state and would otherwise survive the
            same-page navigation unchanged. */}
        <LearnersTable
          key={initialFilter}
          rows={allRows}
          initialFilter={initialFilter}
          filename={`${organisation?.name ?? "org"}-learners.csv`}
        />
      </section>
    </div>
  );
}

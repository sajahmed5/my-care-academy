import Link from "next/link";
import {
  AlertTriangle,
  BadgeAlert,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock,
  MoonStar,
  UserRoundX,
  Users,
} from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tierLabel } from "@/lib/organisations";
import { StatTile } from "@/components/learner-ui";
import { DashboardShell } from "@/components/dashboard-shell";
import { bucketOf, isActiveLearner, isInactive30d, isNeverActive, loadOrgLearners } from "@/lib/org-learners";
import { ChooseWhoLink } from "./choose-who-link";

export default async function OrgDashboard() {
  const context = await requireConsole();

  // All reads go through RLS — an org_admin only ever sees their own org + staff.
  // The explicit organisation filter is for the planner, not for security: it
  // lets Postgres use the organisation_id index instead of testing the policy
  // on every row in the table.
  const orgId = context.organisationId;
  const supabase = await createClient();
  const [{ data: organisation }, allLearners] = await Promise.all([
    supabase
      .from("organisations")
      .select("name, package_tier")
      .eq("id", orgId!)
      .single(),
    loadOrgLearners(supabase, orgId),
  ]);

  // Headline numbers count active staff only; deactivated stay in the matrix.
  const learners = allLearners.filter(isActiveLearner);
  const nowMs = new Date().getTime();

  const inactive = learners.filter((r) => isInactive30d(r, nowMs)).length;
  const neverActive = learners.filter(isNeverActive).length;
  // See the Learners overview: "Active" means they have signed in at least
  // once, so this and Never signed in add up to the roll (issue #24).
  const activeLearners = learners.length - neverActive;
  const inProgress = learners.filter((r) => bucketOf(r) === "in_progress").length;
  const withOverdue = learners.filter((r) => r.stats.overdue > 0).length;

  const totals = learners.reduce(
    (t, r) => ({
      assigned: t.assigned + r.stats.assigned,
      completed: t.completed + r.stats.completed,
      inProgress: t.inProgress + r.stats.inProgress,
      notStarted: t.notStarted + r.stats.notStarted,
      overdue: t.overdue + r.stats.overdue,
      late: t.late + r.lateCompletions,
      expiring: t.expiring + r.stats.expiring,
    }),
    {
      assigned: 0,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
      overdue: 0,
      late: 0,
      expiring: 0,
    },
  );
  // Every rate on this row is a share of assigned COURSES, not of people — the
  // hint under each spells out the fraction so it can't be read as a headcount
  // (issue #21). They needn't total 100: an expired enrolment is none of the
  // three.
  const pct = (n: number) =>
    totals.assigned > 0 ? Math.round((n / totals.assigned) * 100) : 0;
  const overallPct = pct(totals.completed);

  // Reminders for the manager. Each entry can carry a `show` flag so
  // package-gated sources (e.g. the future document matrix) simply slot in.
  //
  // These link through to the filtered list rather than offering a one-tap
  // "remind everyone": some people should not be chased, for reasons the
  // system cannot know (issue #27). Bulk chasing still lives on
  // Learners → Admin, where the group and its headcount are explicit.
  // Names, not headcounts (issue #29): "2 staff members have overdue training"
  // tells a manager nothing they can act on. Capped, because an org that has
  // just imported its roll can have hundreds in a group and the panel would
  // become the page.
  const NAME_CAP = 5;
  const nameList = (rows: typeof learners) => {
    const names = rows.map((r) => r.name);
    if (names.length <= NAME_CAP) return names.join(", ");
    return `${names.slice(0, NAME_CAP).join(", ")} and ${names.length - NAME_CAP} more`;
  };

  const overdueRows = learners.filter((r) => r.stats.overdue > 0);
  const neverRows = learners.filter(isNeverActive);
  // Training falling due, not yet late — the window where a reminder still
  // prevents a breach rather than recording one (issue #29).
  const dueSoonRows = learners.filter((r) => r.stats.dueSoon > 0);

  const reminders = [
    overdueRows.length > 0 && {
      key: "overdue",
      tone: "alert" as const,
      text: `Overdue training: ${nameList(overdueRows)}.`,
      href: "/org/learners?filter=overdue#learners",
      action: <ChooseWhoLink href="/org/learners?filter=overdue#learners" />,
    },
    neverRows.length > 0 && {
      key: "never",
      tone: "alert" as const,
      text: `Never signed in, so can't start training: ${nameList(neverRows)}.`,
      href: "/org/learners?filter=never#learners",
      action: <ChooseWhoLink href="/org/learners?filter=never#learners" />,
    },
    dueSoonRows.length > 0 && {
      key: "due_soon",
      tone: "warn" as const,
      text: `Training due in the next 60 days: ${nameList(dueSoonRows)}.`,
      // Both links go to the same people the sentence names. They used to
      // point at an unfiltered table and a different filter respectively.
      href: "/org/learners?filter=due_soon#learners",
      action: <ChooseWhoLink href="/org/learners?filter=due_soon#learners" />,
    },
    totals.expiring > 0 && {
      key: "expiring",
      tone: "warn" as const,
      text: `${totals.expiring} certificate${totals.expiring === 1 ? " is" : "s are"} expiring soon or already expired.`,
      href: "/org/certificates",
      action: null,
    },
  ].filter(Boolean) as {
    key: string;
    tone: "alert" | "warn";
    text: string;
    href: string;
    action: React.ReactNode;
  }[];

  return (
    <DashboardShell
      title={organisation?.name ?? "Organisation console"}
      context={context}
    >
      {/* What needs doing comes first (design review, 28 Oct 2026): it was a
          single line under eleven equal tiles, so "2 overdue" weighed the same
          as "0 completed late" and the one thing to act on sat at the bottom.
          Tiles that read zero now step back (StatTile dims them). */}
      <div className="space-y-8">
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {reminders.length === 0 ? "All on track" : "Needs your attention"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tierLabel(organisation?.package_tier ?? "core")} plan
            </p>
          </div>
          {reminders.length === 0 ? (
            <p className="rounded-2xl border bg-card px-5 py-6 text-sm text-muted-foreground">
              Nothing needs your attention — everyone&apos;s on track ✓
            </p>
          ) : (
            <ul className="space-y-2">
              {reminders.map((r) => (
                <li
                  key={r.key}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-l-4 bg-card px-5 py-4 shadow-sm ${
                    r.tone === "alert" ? "border-l-rose-500" : "border-l-amber-500"
                  }`}
                >
                  <Link href={r.href} className="min-w-0 flex-1 text-sm font-medium hover:underline">
                    {r.text}
                  </Link>
                  {r.action}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Training
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Assigned training complete" value={`${overallPct}%`} icon={CheckCircle2} color="#10b981" hint={`${totals.completed} of ${totals.assigned} courses`} href="/org/courses" />
            <StatTile label="Overdue courses" value={totals.overdue} icon={BadgeAlert} color="#ef4444" href="/org/learners/statistics?status=overdue" />
            <StatTile label="In progress" value={`${pct(totals.inProgress)}%`} icon={Clock} color="#f59e0b" hint={`${totals.inProgress} of ${totals.assigned} courses`} href="/org/learners/statistics?status=in_progress" />
            <StatTile label="Not started" value={`${pct(totals.notStarted)}%`} icon={CircleDashed} color="#64748b" hint={`${totals.notStarted} of ${totals.assigned} courses`} href="/org/learners/statistics?status=not_started" />
            <StatTile label="Completed late" value={totals.late} icon={CalendarClock} color="#f97316" href="/org/learners/statistics?status=late" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Staff
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Active learners" value={activeLearners} icon={Users} color="#0284c7" href="/org/learners?filter=signed_in#learners" />
            <StatTile label="With overdue training" value={withOverdue} icon={AlertTriangle} color="#e11d48" href="/org/learners?filter=overdue#learners" />
            <StatTile label="Learning now" value={inProgress} icon={BookOpenCheck} color="#f59e0b" href="/org/learners?filter=in_progress#learners" />
            <StatTile label="Not signed in for a month" value={inactive} icon={MoonStar} color="#8b5cf6" href="/org/learners?filter=inactive#learners" />
            <StatTile label="Never signed in" value={neverActive} icon={UserRoundX} color="#e11d48" href="/org/learners?filter=never#learners" />
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

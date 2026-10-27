import Link from "next/link";
import {
  BookOpen,
  CircleDashed,
  Clock,
  CheckCircle2,
  Award,
  AlertTriangle,
  Star,
  ShieldCheck,
  GraduationCap,
  Flame,
  type LucideIcon,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  learnerStats,
  loadActivityDates,
  loadCertificates,
  loadEnrolments,
  loadProfile,
} from "@/lib/learner-data";
import { loadProgramme } from "@/lib/programmes";
import { computeBadges, computeStreak } from "@/lib/gamification";
import { topicTheme, tint } from "@/lib/topic-theme";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  StatTile,
  ProgressRing,
  DueSoonBanner,
  BadgeChip,
} from "@/components/learner-ui";
import { CourseCard } from "./modules/course-card";
import { formatDate } from "@/lib/dates";

const nowMs = () => Date.now();

const BADGE_ICON: Record<string, LucideIcon> = {
  first_pass: Award,
  five_done: Star,
  compliant: ShieldCheck,
  induction: GraduationCap,
};

export default async function LearnerDashboard() {
  const context = await requireRole("learner");
  const now = new Date(nowMs());
  const supabase = await createClient();

  // All in parallel. The enrolment and certificate reads are shared per
  // request, so the programme card and the shell's badge reuse them.
  // The Care Certificate programme (16 standards) drives both the dashboard
  // card and the "Care Certificate" badge.
  const [enrolments, certificates, me, activityDates, programme] =
    await Promise.all([
      loadEnrolments(context.userId),
      loadCertificates(context.userId),
      loadProfile(context.userId),
      loadActivityDates(context.userId),
      loadProgramme(supabase, "care-certificate", context.userId),
    ]);
  const data = { enrolments, certificates, fullName: me.fullName };
  const stats = learnerStats(enrolments, certificates, now);

  const badges = computeBadges({
    assigned: stats.assigned,
    completed: stats.completed,
    certificates: stats.certificates,
    overdue: stats.overdue,
    inductionTotal: programme?.total ?? 0,
    inductionCompleted: programme?.completedCount ?? 0,
  });
  const streak = computeStreak(activityDates, now);

  // Progress grouped by topic.
  const byTopic = new Map<string, { completed: number; total: number }>();
  for (const e of data.enrolments) {
    const k = e.topic ?? "General";
    const t = byTopic.get(k) ?? { completed: 0, total: 0 };
    t.total += 1;
    if (e.status === "completed") t.completed += 1;
    byTopic.set(k, t);
  }

  const recent = data.certificates.slice(0, 4);
  const firstName = (data.fullName ?? "").split(" ")[0] || "there";

  // Course-status breakdown, shown together in one box so the parts visibly
  // add up to the assigned total.
  const courseBreakdown = [
    { label: "Not started", value: stats.notStarted, color: "#64748b", icon: CircleDashed, href: "/learn/modules" },
    { label: "In progress", value: stats.inProgress, color: "#d97706", icon: Clock, href: "/learn/modules" },
    { label: "Completed", value: stats.completed, color: "#16a34a", icon: CheckCircle2, href: "/learn/modules/completed" },
  ];
  const myWork = data.enrolments
    .filter((e) => e.status !== "completed")
    .slice(0, 4);

  return (
    <DashboardShell title="Dashboard" context={context}>
      {/* Warm the shared H5P runtime at low priority so the first course the
          learner opens loads from cache (cached long-term via next.config). */}
      <link rel="prefetch" href="/h5p/assets/frame.bundle.js" as="script" />
      <link rel="prefetch" href="/h5p/assets/main.bundle.js" as="script" />
      <link rel="prefetch" href="/h5p/assets/styles/h5p.css" as="style" />
      <div className="mx-auto max-w-5xl space-y-6">
        <DueSoonBanner count={stats.overdue + stats.expiring} />

        {/* Hero */}
        <div className="flex flex-col items-center gap-6 rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:flex-row sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Hi {firstName} 👋
            </h2>
            <p className="mt-1 text-muted-foreground">
              {[
                `${stats.completed} completed`,
                stats.inProgress > 0 ? `${stats.inProgress} in progress` : null,
                stats.notStarted > 0
                  ? `${stats.notStarted} not started`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {streak > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 font-medium text-orange-600">
                  <Flame className="size-4" /> {streak}-day streak
                </span>
              )}
            </p>
          </div>
          <ProgressRing value={stats.overallPct} color="var(--primary)">
            <span className="text-2xl font-bold">{stats.overallPct}%</span>
            <span className="text-xs text-muted-foreground">complete</span>
          </ProgressRing>
        </div>

        {/* My work: Assigned */}
        {myWork.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">
                My work: Assigned
              </h2>
              <Link
                href="/learn/modules"
                className="text-sm font-medium text-primary hover:underline"
              >
                See all
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {myWork.map((e) => (
                <CourseCard
                  key={e.id}
                  c={{
                    courseId: e.course_id,
                    title: e.title,
                    topic: e.topic,
                    status: e.status,
                    progress: e.progress,
                    dueDate: e.due_date,
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Stat tiles */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Course status — assigned total plus its not-started / in-progress /
              completed breakdown, all in one box so the numbers reconcile at a
              glance (assigned = not started + in progress + completed). */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm sm:col-span-2">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <BookOpen className="size-4 text-sky-600" /> My courses
              </h3>
              <span className="text-sm text-muted-foreground">
                <span className="text-lg font-bold text-foreground">
                  {stats.assigned}
                </span>{" "}
                assigned
              </span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {courseBreakdown.map((s) =>
                s.value > 0 ? (
                  <div
                    key={s.label}
                    style={{
                      width: `${(s.value / stats.assigned) * 100}%`,
                      backgroundColor: s.color,
                    }}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {courseBreakdown.map((s) => (
                <Link
                  key={s.label}
                  href={s.href}
                  className="flex flex-col gap-1 rounded-lg p-2 transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <s.icon className="size-3.5" style={{ color: s.color }} />
                    {s.label}
                  </span>
                  <span className="text-xl font-bold">{s.value}</span>
                </Link>
              ))}
            </div>
          </div>
          <StatTile label="Certificates" value={stats.certificates} icon={Award} color="#7c3aed" href="/learn/certificates" />
          <StatTile label="Need attention" value={stats.overdue + stats.expiring} icon={AlertTriangle} color="#e11d48" href="/learn/notifications" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Progress by topic */}
          <Card>
            <CardHeader>
              <CardTitle>Progress by topic</CardTitle>
              <CardDescription>How you&apos;re doing in each area.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {byTopic.size === 0 && (
                <p className="text-sm text-muted-foreground">
                  No courses assigned yet.
                </p>
              )}
              {[...byTopic.entries()].map(([topic, t]) => {
                const theme = topicTheme(topic);
                const pct = t.total ? Math.round((t.completed / t.total) * 100) : 0;
                return (
                  <div key={topic}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{topic}</span>
                      <span className="text-muted-foreground">
                        {t.completed}/{t.total}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: theme.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Induction + recent */}
          <div className="space-y-6">
            {programme && (
              <Link href={`/learn/programmes/${programme.slug}`} className="block">
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle>The Care Certificate</CardTitle>
                    <CardDescription>
                      {programme.completedCount}/{programme.total} standards
                      complete
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${programme.total ? Math.round((programme.completedCount / programme.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Recent achievements</CardTitle>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Pass a course to see it here 🎓
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {recent.map((c) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <span
                          className="flex size-6 items-center justify-center rounded-full"
                          style={{ backgroundColor: tint("#16a34a"), color: "#16a34a" }}
                        >
                          <Award className="size-3.5" />
                        </span>
                        <span className="truncate">{c.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDate(c.issued_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Badges */}
        <Card>
          <CardHeader>
            <CardTitle>Your badges</CardTitle>
            <CardDescription>Milestones you&apos;ve unlocked.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {badges.map((b) => (
                <BadgeChip
                  key={b.key}
                  label={b.label}
                  description={b.description}
                  icon={BADGE_ICON[b.key] ?? Award}
                  earned={b.earned}
                  color="#7c3aed"
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Link href="/learn/modules" className={buttonVariants({ size: "lg" })}>
            Go to my training
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}

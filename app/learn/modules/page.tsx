import { requireRole } from "@/lib/auth";
import { loadEnrolments, type Enrolment } from "@/lib/learner-data";
import { byUrgency } from "@/lib/learner-stats";
import { isOverdue } from "@/lib/engine-logic";
import { DashboardShell } from "@/components/dashboard-shell";
import { ModulesTabs } from "./modules-tabs";
import { CourseCard } from "./course-card";

const nowMs = () => Date.now();

function Section({ title, items }: { title: string; items: Enrolment[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {items.map((e) => (
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
  );
}

export default async function AssignedModulesPage() {
  const context = await requireRole("learner");
  const enrolments = await loadEnrolments(context.userId);

  // Overdue gets its own section at the top, whatever its status, and every
  // section runs soonest-due first.
  const now = new Date(nowMs());
  const outstanding = byUrgency(
    enrolments.filter((e) => e.status !== "completed"),
    now,
  );
  const overdue = outstanding.filter((e) => isOverdue(e.due_date, e.status, now));
  const rest = outstanding.filter((e) => !overdue.includes(e));
  const expired = rest.filter((e) => e.status === "expired");
  const inProgress = rest.filter((e) => e.status === "in_progress");
  const notStarted = rest.filter((e) => e.status === "not_started");

  return (
    <DashboardShell title="Training" context={context}>
      <div className="space-y-6">
        <ModulesTabs />

        {outstanding.length === 0 && (
          <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
            You&apos;re all caught up 🎉 Browse the{" "}
            <a href="/learn/modules/all" className="text-primary underline">
              full catalogue
            </a>{" "}
            to learn something new.
          </p>
        )}

        <Section title="Overdue" items={overdue} />
        <Section title="Required again" items={expired} />
        <Section title="In progress" items={inProgress} />
        <Section title="To do" items={notStarted} />
      </div>
    </DashboardShell>
  );
}

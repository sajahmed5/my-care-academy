import { requireStaff } from "@/lib/auth";
import { loadEnrolments } from "@/lib/learner-data";
import { DashboardShell } from "@/components/dashboard-shell";
import { ModulesTabs } from "../modules-tabs";
import { CourseCard } from "../course-card";

export default async function CompletedModulesPage() {
  const context = await requireStaff();
  const enrolments = await loadEnrolments(context.userId);
  const completed = enrolments.filter((e) => e.status === "completed");

  return (
    <DashboardShell learn title="Training" context={context}>
      <div className="space-y-6">
        <ModulesTabs />

        {completed.length === 0 ? (
          <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
            No completed courses yet — finish a course and pass its assessment to
            see it here.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {completed.map((e) => (
              <CourseCard
                key={e.id}
                c={{
                  courseId: e.course_id,
                  title: e.title,
                  topic: e.topic,
                  slug: e.slug,
                  status: e.status,
                  progress: 100,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

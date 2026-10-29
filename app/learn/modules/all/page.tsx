import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCertificates, loadEnrolments } from "@/lib/learner-data";
import { DashboardShell } from "@/components/dashboard-shell";
import { ModulesTabs } from "../modules-tabs";
import { AllCourses, type CatalogueCourse } from "./all-courses";

export default async function AllCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await requireRole("learner");
  const { q } = await searchParams;
  const supabase = await createClient();

  // The catalogue list needs no content: title, description and topic only.
  const [enrolments, certificates, { data: courses }] = await Promise.all([
    loadEnrolments(context.userId),
    loadCertificates(context.userId),
    supabase
      .from("courses")
      .select("id, title, description, topics(title)")
      .order("sort_order"),
  ]);

  // A course is "completed on" the day its most recent certificate was issued —
  // there is no completed_at on enrolments, and the pass is what completes it.
  const latestIssued = new Map<string, string>();
  for (const c of certificates) {
    const prev = latestIssued.get(c.course_id);
    if (!prev || +new Date(c.issued_at) > +new Date(prev)) {
      latestIssued.set(c.course_id, c.issued_at);
    }
  }
  const completedAt: Record<string, string | null> = {};
  for (const e of enrolments) {
    if (e.status === "completed") {
      completedAt[e.course_id] = latestIssued.get(e.course_id) ?? null;
    }
  }

  const catalogue: CatalogueCourse[] = (courses ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    topic: (c.topics as unknown as { title: string } | null)?.title ?? null,
  }));

  return (
    <DashboardShell title="Training" context={context}>
      <div className="space-y-6">
        <ModulesTabs />
        <p className="text-sm text-muted-foreground">
          Browse the full catalogue and enrol on any course.
        </p>
        <AllCourses
          courses={catalogue}
          enrolledIds={enrolments.map((e) => e.course_id)}
          completedAt={completedAt}
          initialQuery={q ?? ""}
        />
      </div>
    </DashboardShell>
  );
}

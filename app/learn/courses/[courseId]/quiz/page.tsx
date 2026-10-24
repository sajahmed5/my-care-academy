import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { QuizRunner } from "./quiz-runner";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const context = await requireRole("learner");
  const { courseId } = await params;

  const supabase = await createClient();
  // Must be enrolled. Both reads at once; the user_id filter uses the
  // (user_id, course_id) index, RLS still scopes it.
  const [{ data: enrolment }, { data: course }] = await Promise.all([
    supabase
      .from("enrolments")
      .select("id")
      .eq("user_id", context.userId)
      .eq("course_id", courseId)
      .maybeSingle(),
    supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
  ]);
  if (!enrolment) notFound();
  if (!course) notFound();

  return (
    <DashboardShell title={course.title} context={context}>
      <QuizRunner courseId={courseId} courseTitle={course.title} />
    </DashboardShell>
  );
}

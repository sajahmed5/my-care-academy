import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBlocks, allH5P } from "@/lib/content";
import { DashboardShell } from "@/components/dashboard-shell";
import { H5PCoursePlayer } from "@/components/content/h5p-course-player";
import { CoursePlayer } from "./course-player";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const context = await requireStaff();
  const { courseId } = await params;

  const supabase = await createClient();

  // This one course and the learner's own enrolment on it, side by side; no
  // enrolment => not assigned. The user_id filter hits the (user_id,
  // course_id) unique index; RLS still decides what the learner may see.
  const [{ data: enrolment }, { data: course }] = await Promise.all([
    supabase
      .from("enrolments")
      .select("id, current_block")
      .eq("user_id", context.userId)
      .eq("course_id", courseId)
      .maybeSingle(),
    supabase
      .from("courses")
      .select("title, description, summary, content_blocks, estimated_minutes")
      .eq("id", courseId)
      .maybeSingle(),
  ]);
  if (!enrolment) notFound();
  if (!course) notFound();

  const blocks = parseBlocks(course.content_blocks);
  const h5pPages = allH5P(blocks);

  // The course summary ("what you covered") is stored as JSON text; parse it
  // defensively so a malformed value just hides the recap rather than erroring.
  let summary: { intro: string; points: string[] } | null = null;
  if (course.summary) {
    try {
      const s = JSON.parse(course.summary);
      if (s && Array.isArray(s.points) && s.points.length > 0) {
        summary = { intro: typeof s.intro === "string" ? s.intro : "", points: s.points.map(String) };
      }
    } catch {
      summary = null;
    }
  }

  return (
    <DashboardShell learn title={course.title} context={context}>
      {h5pPages ? (
        <H5PCoursePlayer
          enrolmentId={enrolment.id}
          courseId={courseId}
          title={course.title}
          description={course.description ?? ""}
          summary={summary}
          estimatedMinutes={course.estimated_minutes ?? null}
          pages={h5pPages}
          initialBlock={enrolment.current_block ?? 0}
        />
      ) : (
        <CoursePlayer
          enrolmentId={enrolment.id}
          courseId={courseId}
          title={course.title}
          blocks={blocks}
          initialBlock={enrolment.current_block ?? 0}
        />
      )}
    </DashboardShell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { correctAnswerText, type StoredQuestion } from "@/lib/quiz";
import { QuestionEditor, type Question } from "./question-editor";
import { RetireCourse } from "./retire-course";
import { unfinishedAssignments } from "@/app/platform/course-actions";
import { formatDate } from "@/lib/dates";

export default async function CourseQuestionsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const context = await requireRole("platform_admin");
  const { courseId } = await params;

  const supabase = await createClient();
  const [{ data: course }, { data: questions }, unfinished] = await Promise.all([
    supabase.from("courses").select("id, title, retired_at").eq("id", courseId).maybeSingle(),
    supabase
      .from("quiz_questions")
      .select("id, type, question, options, answer_index, payload")
      .eq("course_id", courseId)
      .order("sort_order"),
    unfinishedAssignments(courseId),
  ]);

  if (!course) notFound();

  // Only MCQs carry a full options list; the other types keep their answer in
  // `payload` and are shown read-only by the editor.
  const initial: Question[] = ((questions ?? []) as StoredQuestion[]).map(
    (q) => ({
      id: q.id,
      type: q.type,
      question: q.question,
      options: q.options ?? [],
      answerIndex: q.answer_index ?? 0,
      correct: correctAnswerText(q),
    }),
  );

  return (
    <DashboardShell title={`${course.title} — questions`} context={context}>
      <div className="space-y-6">
        <Link
          href="/platform/courses"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← All courses
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Assessment question bank</CardTitle>
            <CardDescription>
              Learners get a random selection from this bank. Mark the correct
              option with the radio button. Only multiple-choice questions can
              be edited here; the other types are shown read-only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuestionEditor courseId={courseId} initialQuestions={initial} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{course.retired_at ? "Retired" : "Retire this course"}</CardTitle>
            <CardDescription>
              {course.retired_at
                ? `Retired on ${formatDate(course.retired_at as string)}. It isn't offered anywhere — not in MyRoster, the console's assign screens, carers' All courses page or the sets of courses — and its renewal emails have stopped. Every certificate and completion is kept. Bringing it back offers it again; the assignments removed when it was retired don't come back.`
                : "Stops the course being offered anywhere — MyRoster, the console's assign screens, carers' All courses page and the sets of courses — and stops its renewal emails. Every assignment nobody has finished is removed. Certificates and completions are kept. Use this instead of deleting a course, which would delete every company's certificates for it."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RetireCourse
              courseId={courseId}
              title={course.title as string}
              retiredAt={(course.retired_at as string | null) ?? null}
              unfinished={unfinished}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

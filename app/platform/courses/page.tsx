import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CoursesAdminPage() {
  const context = await requireRole("platform_admin");

  const supabase = await createClient();
  // Question counts are counted by the database, one per course. This used to
  // download every question's course id and tally them here — and the bank
  // passed the 1,000-row read cap long ago (2,719 questions, Oct 2026), so
  // most courses showed a short or zero count.
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title, retired_at, topics(title), quiz_questions(count)")
    .order("sort_order");
  // Retired courses go to the bottom, marked.
  const ordered = [...(courses ?? [])].sort((a, b) => Number(!!a.retired_at) - Number(!!b.retired_at));
  const questionCount = (c: { quiz_questions?: unknown }) =>
    (c.quiz_questions as { count?: number }[] | null)?.[0]?.count ?? 0;

  return (
    <DashboardShell title="Courses & question banks" context={context}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Course catalogue</CardTitle>
            <CardDescription>
              Manage each course&apos;s assessment question bank (aim for ~50 per
              course), or retire a course that shouldn&apos;t be offered any more.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">Course</th>
                    <th className="py-2 font-medium">Topic</th>
                    <th className="py-2 font-medium">Questions</th>
                    <th className="py-2 font-medium text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((c) => {
                    const topic = (c.topics as unknown as { title: string } | null)
                      ?.title;
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">
                          {c.title}
                          {c.retired_at && <Badge variant="secondary" className="ml-2">Retired</Badge>}
                        </td>
                        <td className="py-2 text-muted-foreground">{topic}</td>
                        <td className="py-2">{questionCount(c)}</td>
                        <td className="py-2 text-right">
                          <Link
                            href={`/platform/courses/${c.id}`}
                            className={buttonVariants({
                              size: "sm",
                              variant: "outline",
                            })}
                          >
                            Manage
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

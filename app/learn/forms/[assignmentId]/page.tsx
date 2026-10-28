import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { loadAssignment } from "@/lib/form-library";
import { FormComplete } from "./form-complete";
import { formatDate } from "@/lib/dates";

/** One form to complete. RLS makes sure it is this carer's. */
export default async function LearnerFormPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const context = await requireRole("learner");
  const { assignmentId } = await params;
  const supabase = await createClient();
  const assignment = await loadAssignment(supabase, assignmentId);
  if (!assignment || assignment.user_id !== context.userId) notFound();

  return (
    <DashboardShell title={assignment.template_title} context={context}>
      <div className="mx-auto max-w-6xl space-y-6 *:max-w-2xl">
        <Link href="/learn/forms" className="text-sm text-muted-foreground hover:underline">
          ← All forms
        </Link>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{assignment.template_title}</h2>
          {assignment.template.description && (
            <p className="text-sm text-muted-foreground">{assignment.template.description}</p>
          )}
          {assignment.note && <p className="text-sm">{assignment.note}</p>}
        </div>

        {assignment.completed_at ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              You completed this on{" "}
              {formatDate(assignment.completed_at, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              .
            </CardContent>
          </Card>
        ) : (
          <FormComplete assignmentId={assignment.id} fields={assignment.template.fields} />
        )}
      </div>
    </DashboardShell>
  );
}

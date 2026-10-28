import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { loadAssignment } from "@/lib/form-library";
import { FormComplete } from "@/app/learn/forms/[assignmentId]/form-complete";
import { formatDate } from "@/lib/dates";

/**
 * A manager completing a library form themselves (issue #50) — the org-side
 * twin of /learn/forms/[assignmentId]. Same form, same action; only the
 * person's own self-assignment can be opened here, so a manager cannot fill
 * in a form that was asked of a carer.
 */
export default async function OrgCompleteFormPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "forms.builder");
  const { assignmentId } = await params;
  const supabase = await createClient();
  const assignment = await loadAssignment(supabase, assignmentId);
  if (!assignment || assignment.user_id !== context.userId) notFound();

  const back = `/org/forms/library/${encodeURIComponent(assignment.template_code)}`;

  return (
    <DashboardShell title={assignment.template_title} context={context}>
      <div className="mx-auto max-w-6xl space-y-6 *:max-w-2xl">
        <Link href={back} className="text-sm text-muted-foreground hover:underline">
          ← Back to the form
        </Link>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{assignment.template_title}</h2>
          {assignment.template.description && (
            <p className="text-sm text-muted-foreground">{assignment.template.description}</p>
          )}
          <p className="text-sm text-muted-foreground">
            You are completing this yourself. It is recorded against your name, with the date and time.
          </p>
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
              .{" "}
              <Link href={`${back}/responses/${assignment.id}`} className="text-foreground hover:underline">
                View your answers
              </Link>
            </CardContent>
          </Card>
        ) : (
          <FormComplete
            assignmentId={assignment.id}
            fields={assignment.template.fields}
            doneMessage="Saved — this is now on record against your name."
            doneHref={back}
            doneLabel="Back to the form"
          />
        )}
      </div>
    </DashboardShell>
  );
}

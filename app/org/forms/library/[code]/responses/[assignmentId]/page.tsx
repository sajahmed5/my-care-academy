import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { loadAssignment, loadResponse, responseRows } from "@/lib/form-library";
import { formatDateTime } from "@/lib/dates";

/**
 * A completed form, read back (#54): who handed it in, when, and every answer
 * against its question. Read-only — a completed form is a fact with a date,
 * and form_responses grants no update to anyone but the service role.
 */
export default async function FormResponsePage({
  params,
}: {
  params: Promise<{ code: string; assignmentId: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "forms.builder");
  const { assignmentId } = await params;

  const supabase = await createClient();
  const [assignment, response] = await Promise.all([
    loadAssignment(supabase, assignmentId),
    loadResponse(supabase, assignmentId),
  ]);
  if (!assignment || !response) notFound();

  const back = `/org/forms/library/${encodeURIComponent(assignment.template_code)}`;
  const rows = responseRows(assignment.template.fields, response.answers);
  const revised = response.template_version !== assignment.template.version;

  return (
    <DashboardShell title={assignment.template_title} context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={back} className="text-sm text-muted-foreground hover:underline">
          ← Back to the form
        </Link>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{assignment.template_title}</h2>
          <p className="text-sm text-muted-foreground">
            Completed by{" "}
            <Link href={`/org/staff/${assignment.user_id}`} className="font-medium text-foreground hover:underline">
              {assignment.user_name}
            </Link>{" "}
            on {formatDateTime(response.submitted_at)} · version {response.template_version}
          </p>
          {revised && (
            <p className="text-xs text-amber-700">
              The form has been revised since (it is now version {assignment.template.version}), so some questions may read differently from when this was filled in.
            </p>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            <dl className="divide-y">
              {rows.map((r) => (
                <div key={r.fieldId} className="space-y-1 py-3 first:pt-0 last:pb-0">
                  <dt className={`text-sm font-medium ${r.removed ? "text-muted-foreground italic" : ""}`}>{r.label}</dt>
                  <dd className="whitespace-pre-wrap text-sm">
                    {r.value || <span className="text-muted-foreground">Not answered</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {response.signed_name && (
          <p className="text-sm text-muted-foreground">
            Signed by typing their name: <span className="font-medium text-foreground">{response.signed_name}</span>, on{" "}
            {formatDateTime(response.submitted_at)}.
          </p>
        )}
      </div>
    </DashboardShell>
  );
}

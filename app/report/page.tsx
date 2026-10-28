import { requireAdminMfa, requireUser, assertActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { STATUS_LABELS, statusPillClass } from "@/app/platform/reports/status";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "My reports" };

function fmt(d: string): string {
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Every issue the signed-in person has reported, with its status and the
 * support team's note (issue #41). Before this, a reporter never saw what
 * happened to a report unless someone told them separately.
 */
export default async function MyReportsPage() {
  const context = await requireUser();
  if (context.role !== "learner") await requireAdminMfa();
  await assertActiveMember(context);

  const supabase = await createClient();
  // Filtered to the caller explicitly: a platform admin's RLS reads every report.
  const { data } = await supabase
    .from("issue_reports")
    .select("id, report_no, summary, description, status, admin_note, created_at, updated_at")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(200);
  const reports = data ?? [];

  return (
    <DashboardShell title="My reports" context={context}>
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Issues you&apos;ve reported with the Report button, and what the support team has
          done about them. You get an email when you report something, and
          again whenever there&apos;s an update.
        </p>

        {reports.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            You haven&apos;t reported any issues yet. If something isn&apos;t working, use the
            Report button at the bottom of any page.
          </div>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      <span className="font-mono text-muted-foreground">#{r.report_no}</span>{" "}
                      {r.summary}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reported {fmt(r.created_at)}
                      {r.updated_at && fmt(r.updated_at) !== fmt(r.created_at)
                        ? ` · updated ${fmt(r.updated_at)}`
                        : ""}
                    </p>
                  </div>
                  <span className={statusPillClass(r.status)}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>

                {r.description && (
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {r.description}
                  </p>
                )}

                {r.admin_note ? (
                  <div className="rounded-lg border-l-4 border-primary bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Note from the support team
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{r.admin_note}</p>
                  </div>
                ) : r.status !== "resolved" ? (
                  <p className="text-xs text-muted-foreground">No update from the team yet.</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}

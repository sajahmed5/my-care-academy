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
import { fetchAll } from "@/lib/fetch-all";
import { allHref, latest } from "@/lib/latest";
import { ViewAll } from "@/components/view-all";
import { ReportsTable, type ReportRow } from "./reports-table";

export default async function ReportsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const context = await requireRole("platform_admin");
  const q = await searchParams;

  const supabase = await createClient();
  // Every report, newest first, paged past the 1,000-row answer; the page
  // shows the most recent 200 unless asked for all of them.
  const reports = await fetchAll<ReportRow>((from, to) =>
    supabase
      .from("issue_reports")
      .select(
        "id, report_no, kind, summary, reporter_email, reporter_role, page_path, status, created_at",
      )
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  const openCount = reports.filter((r) => r.status === "open").length;
  const list = latest(reports, q.all);

  return (
    <DashboardShell title="Issues & bug reports" context={context}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Reported issues</CardTitle>
            <CardDescription>
              Feedback and bug reports from across the platform.{" "}
              {openCount > 0 ? `${openCount} open.` : "Nothing open right now."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No reports yet.
              </p>
            ) : (
              <>
                <ReportsTable rows={list.rows} />
                <ViewAll list={list} href={allHref("/platform/reports", q)} noun="reports" />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

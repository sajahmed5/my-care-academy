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
import { ReportsTable, type ReportRow } from "./reports-table";

export default async function ReportsAdminPage() {
  const context = await requireRole("platform_admin");

  const supabase = await createClient();
  const { data } = await supabase
    .from("issue_reports")
    .select(
      "id, report_no, summary, reporter_email, reporter_role, page_path, status, created_at",
    )
    .order("created_at", { ascending: false });
  const reports = (data ?? []) as ReportRow[];
  const openCount = reports.filter((r) => r.status === "open").length;

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
              <ReportsTable rows={reports} />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

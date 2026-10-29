import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { STATUS_LABELS, statusPillClass } from "../status";
import { StatusForm } from "./status-form";
import { formatDateTime } from "@/lib/dates";

interface ReportDetail {
  id: string;
  report_no: number;
  summary: string;
  description: string | null;
  reporter_email: string | null;
  reporter_role: string | null;
  organisation_id: string | null;
  page_path: string | null;
  screenshot_path: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
}

function fmt(d: string): string {
  return formatDateTime(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireRole("platform_admin");
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("issue_reports")
    .select(
      "id, report_no, summary, description, reporter_email, reporter_role, organisation_id, page_path, screenshot_path, status, admin_note, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  const report = data as ReportDetail | null;
  if (!report) notFound();

  // Signed URL for the screenshot (private bucket → service-role, 60s TTL).
  let screenshotUrl: string | null = null;
  if (report.screenshot_path) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("issue-screenshots")
      .createSignedUrl(report.screenshot_path, 60);
    screenshotUrl = signed?.signedUrl ?? null;
  }

  return (
    <DashboardShell title={`Issue #${report.report_no}`} context={context}>
      <div className="space-y-6">
        <Link
          href="/platform/reports"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to issues
        </Link>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>
                  <span className="font-mono text-muted-foreground">
                    #{report.report_no}
                  </span>{" "}
                  {report.summary}
                </CardTitle>
                <CardDescription>
                  Reported {fmt(report.created_at)}
                </CardDescription>
              </div>
              <span className={statusPillClass(report.status)}>
                {STATUS_LABELS[report.status] ?? report.status}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Reporter</dt>
                <dd>{report.reporter_email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd>{report.reporter_role ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Page</dt>
                <dd className="break-all">{report.page_path ?? "—"}</dd>
              </div>
            </dl>

            {report.description && (
              <div className="space-y-1">
                <p className="text-sm font-medium">What happened</p>
                <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
                  {report.description}
                </p>
              </div>
            )}

            {report.screenshot_path && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Screenshot</p>
                {screenshotUrl ? (
                  <a href={screenshotUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotUrl}
                      alt={`Screenshot for issue #${report.report_no}`}
                      className="w-full rounded-lg border"
                    />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Screenshot unavailable.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Triage</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusForm
              id={report.id}
              status={report.status}
              adminNote={report.admin_note}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

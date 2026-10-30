import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { ReportView } from "@/components/bespoke/report-view";
import { reportForConsole } from "@/lib/bespoke/access";
import { runReport } from "@/lib/bespoke/load";
import { ukToday } from "@/lib/bespoke/working-days";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Our reports" };
export const maxDuration = 60;

/**
 * One of the company's bespoke reports, run live each time it's opened
 * (BESPOKE-REPORTS.md), with its PDF and Excel downloads.
 */
export default async function BespokeReportPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "reports.bespoke");
  const { id } = await params;
  const report = await reportForConsole(context, id);
  if (!report) notFound();
  const run = await runReport(createAdminClient(), report.organisation_id, report, ukToday());

  return (
    <DashboardShell title={report.title} context={context}>
      <div className="space-y-5">
        <Link href="/org/reports#our-reports" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" />
          Evidence &amp; exports
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            {report.description && <p className="text-sm text-muted-foreground">{report.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              Live: run {formatDateTime(new Date())}
              {report.managers_only && " · Managers only"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/org/reports/bespoke/${report.id}/download?format=pdf`} className={buttonVariants({ variant: "outline" })}>
              <Download className="size-4" />
              PDF
            </a>
            <a href={`/org/reports/bespoke/${report.id}/download?format=xlsx`} className={buttonVariants({ variant: "outline" })}>
              <Download className="size-4" />
              Excel
            </a>
          </div>
        </div>
        <ReportView run={run} />
      </div>
    </DashboardShell>
  );
}

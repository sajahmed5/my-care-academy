import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { ReportView } from "@/components/bespoke/report-view";
import { RequestStatus } from "@/components/bespoke/request-parts";
import { parseDefinition } from "@/lib/bespoke/definition";
import { runReport } from "@/lib/bespoke/load";
import { ukToday } from "@/lib/bespoke/working-days";
import { formatDateTime } from "@/lib/dates";
import { Builder } from "./builder";
import { ArchiveButton } from "./archive-button";
import { StatusButtons } from "../requests/[id]/status-buttons";

export const metadata = { title: "Report builder" };
export const maxDuration = 60;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * The report builder for one company's report (BESPOKE-REPORTS.md): the
 * builder above, the company's live data below, run from what was last saved.
 */
export default async function ReportBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireRole("platform_admin");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("bespoke_reports")
    .select(
      "id, organisation_id, title, description, definition, managers_only, archived_at, updated_at, organisation:organisations (name), request:report_requests (id, request_no, title, status, question)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const report = data as unknown as {
    id: string;
    organisation_id: string;
    title: string;
    description: string | null;
    definition: unknown;
    managers_only: boolean;
    archived_at: string | null;
    updated_at: string;
    organisation: { name: string } | { name: string }[] | null;
    request:
      | { id: string; request_no: number; title: string; status: string; question: string }
      | { id: string; request_no: number; title: string; status: string; question: string }[]
      | null;
  };
  const org = one(report.organisation)?.name ?? "Unknown company";
  const request = one(report.request);
  const definition = parseDefinition(report.definition);
  const run = await runReport(createAdminClient(), report.organisation_id, report, ukToday());

  return (
    <DashboardShell title={report.title} context={context}>
      <div className="space-y-6">
        <Link href="/platform/bespoke-reports" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" />
          Bespoke reports
        </Link>

        <section className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
          <p>
            Built for{" "}
            <Link href={`/platform/organisations/${report.organisation_id}`} className="font-medium text-primary hover:underline">
              {org}
            </Link>{" "}
            only. Last saved {formatDateTime(report.updated_at)}.
            {report.managers_only && " The company keeps it to managers."}
            {report.archived_at && <strong className="text-red-700"> Taken down: the company can&apos;t see it.</strong>}
          </p>
          {request && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3">
              <p className="flex flex-wrap items-center gap-2">
                <Link href={`/platform/bespoke-reports/requests/${request.id}`} className="font-medium text-primary hover:underline">
                  Request #{request.request_no}: {request.title}
                </Link>
                <RequestStatus status={request.status} />
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">{request.question}</p>
              <StatusButtons requestId={request.id} status={request.status} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <a href={`/platform/bespoke-reports/${report.id}/download?format=pdf`} className={buttonVariants({ variant: "outline" })}>
              <Download className="size-4" />
              PDF
            </a>
            <a href={`/platform/bespoke-reports/${report.id}/download?format=xlsx`} className={buttonVariants({ variant: "outline" })}>
              <Download className="size-4" />
              Excel
            </a>
            <ArchiveButton reportId={report.id} archived={!!report.archived_at} />
          </div>
        </section>

        <Builder
          reportId={report.id}
          initial={{ title: report.title, description: report.description ?? "", definition }}
        />

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Preview: {org}&apos;s live data</h2>
          <ReportView run={run} />
        </div>
      </div>
    </DashboardShell>
  );
}

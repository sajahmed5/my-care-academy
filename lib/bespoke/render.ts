import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orgBranding } from "@/lib/branding";
import { runReport } from "./load";
import { renderReportPdf } from "./pdf";
import { renderReportXlsx, reportFilename } from "./excel";
import { ukToday } from "./working-days";

export interface StoredReport {
  id: string;
  organisation_id: string;
  title: string;
  description: string | null;
  definition: unknown;
  managers_only: boolean;
}

export const REPORT_COLUMNS = "id, organisation_id, title, description, definition, managers_only";

/**
 * A bespoke report as a file, run now: the PDF with the company's logo, or
 * Excel with every row. Used by the company's download, ours, and the
 * scheduled email alike, so all three are the same report.
 */
export async function reportFile(
  admin: SupabaseClient,
  report: StoredReport,
  format: "pdf" | "xlsx",
  now = new Date(),
): Promise<{ body: Uint8Array; contentType: string; filename: string }> {
  const today = ukToday(now);
  const [run, brand] = await Promise.all([
    runReport(admin, report.organisation_id, report, today, { allRows: format === "xlsx" }),
    orgBranding(report.organisation_id),
  ]);
  const organisationName = brand?.name ?? "Your company";
  if (format === "pdf") {
    const body = await renderReportPdf(run, { organisationName, logoUrl: brand?.logoUrl ?? null }, now);
    return { body: new Uint8Array(body), contentType: "application/pdf", filename: reportFilename(report.title, today, "pdf") };
  }
  return {
    body: await renderReportXlsx(run, organisationName, now),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: reportFilename(report.title, today, "xlsx"),
  };
}

/** A download response for the file. */
export function fileResponse(file: { body: Uint8Array; contentType: string; filename: string }): Response {
  return new Response(file.body as unknown as BodyInit, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

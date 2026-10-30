import { formatDateTime } from "@/lib/dates";
import type { ReportRun } from "./load";
import { formatValue, type Column, type Value } from "./run";
import { buildXlsx, type XlsxCell, type XlsxSheet } from "./xlsx-write";

/**
 * A bespoke report as Excel (BESPOKE-REPORTS.md): a first sheet saying what
 * it is and when it was run, then one sheet per section with every row —
 * flat, with the group as the first column, so it sorts, filters and pivots
 * the way people use Excel. A section's count per group gets its own sheet.
 */

function excelCell(c: Column, v: Value): XlsxCell {
  if (v === null || v === "") return null;
  if (c.type === "date") return { date: String(v) };
  if (c.type === "number") return typeof v === "number" ? v : Number(v);
  if (c.type === "bool" || c.type === "enum") return formatValue(c, v);
  return String(v);
}

/** `run` must have been made with allRows, or the sheets stop where the screen does. */
export function reportSheets(run: ReportRun, organisationName: string, generatedAt: Date): XlsxSheet[] {
  const about: XlsxSheet = {
    name: "About",
    rows: [
      [run.title, null],
      ["Company", organisationName],
      ["Run", formatDateTime(generatedAt)],
      ...(run.description ? [["About", run.description] as XlsxCell[]] : []),
      [null, null],
      ["Section", "Rows"],
      ...run.sections.map((s) => [`${s.title} (${s.basis})`, s.unavailable ? "Not in your package" : s.total] as XlsxCell[]),
    ],
  };
  const sheets: XlsxSheet[] = [about];
  for (const s of run.sections) {
    if (s.unavailable) continue;
    if (s.summary) {
      sheets.push({
        name: `${s.title} summary`,
        rows: [["Group", "Count", "%"], ...s.summary.map((g) => [g.label, g.count, g.percent] as XlsxCell[])],
      });
    }
    if (!s.showTable) continue;
    const header = s.columns.map((c) => c.label);
    const body = s.groups
      ? s.groups.flatMap((g) => g.rows.map((r) => [g.label, ...r.map((v, i) => excelCell(s.columns[i], v))]))
      : s.rows.map((r) => r.map((v, i) => excelCell(s.columns[i], v)));
    sheets.push({ name: s.title, rows: [s.groups ? ["Group", ...header] : header, ...body] });
  }
  return sheets;
}

export function renderReportXlsx(run: ReportRun, organisationName: string, generatedAt = new Date()): Promise<Uint8Array> {
  return buildXlsx(reportSheets(run, organisationName, generatedAt));
}

/** "Monthly training summary 2026-10-30" with nothing a filename can't hold. */
export function reportFilename(title: string, today: string, ext: "pdf" | "xlsx"): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "Report";
  return `${safe} ${today}.${ext}`;
}

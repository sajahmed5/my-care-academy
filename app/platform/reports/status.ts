export const REPORT_STATUSES = ["open", "reviewing", "resolved"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Resolved",
};

const STATUS_CLASSES: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  reviewing: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
};

export function statusPillClass(status: string): string {
  return `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
    STATUS_CLASSES[status] ?? "bg-muted text-muted-foreground"
  }`;
}

/**
 * What kind of report it is (issue report 100): the reporter picks one, so
 * a question isn't triaged like a fault. "problem" is the default, and what
 * every report from before the picker is.
 */
export const REPORT_KINDS = ["problem", "question", "wording", "idea"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const KIND_LABELS: Record<string, string> = {
  problem: "Something's wrong",
  question: "A question",
  wording: "Wording",
  idea: "An idea",
};

export const isReportKind = (v: unknown): v is ReportKind =>
  typeof v === "string" && (REPORT_KINDS as readonly string[]).includes(v);

export const kindPillClass =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground";

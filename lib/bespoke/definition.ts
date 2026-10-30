/**
 * A bespoke report, as the builder saves it (bespoke_reports.definition).
 *
 * Data, not code: one or more sections, each reading one source (catalogue)
 * with a period, filters, the columns shown, a sort, an optional grouping and
 * a chart of the grouped counts. Most reports need nothing more, which is what
 * makes the 10-working-day promise realistic (BESPOKE-REPORTS.md).
 *
 * parseDefinition is the only way a definition is read — from the database,
 * the builder or the AI — and drops anything the catalogue doesn't know, so a
 * renamed field can never make a saved report throw.
 */

import { fieldDef, sourceDef, type FieldType } from "./catalogue";

export const PERIODS = [
  { value: "all", label: "Any time" },
  { value: "last_7_days", label: "The last 7 days" },
  { value: "last_30_days", label: "The last 30 days" },
  { value: "last_90_days", label: "The last 90 days" },
  { value: "last_12_months", label: "The last 12 months" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "next_30_days", label: "The next 30 days" },
  { value: "next_90_days", label: "The next 90 days" },
] as const;
export type Period = (typeof PERIODS)[number]["value"];

export const OPERATORS: { value: Operator; label: string; types: FieldType[]; needsValue: boolean }[] = [
  { value: "is", label: "is", types: ["text", "enum", "number"], needsValue: true },
  { value: "is_not", label: "is not", types: ["text", "enum", "number"], needsValue: true },
  { value: "contains", label: "contains", types: ["text"], needsValue: true },
  { value: "gte", label: "is at least", types: ["number"], needsValue: true },
  { value: "lte", label: "is at most", types: ["number"], needsValue: true },
  { value: "before", label: "is before", types: ["date"], needsValue: true },
  { value: "after", label: "is after", types: ["date"], needsValue: true },
  { value: "past", label: "has passed", types: ["date"], needsValue: false },
  { value: "within_next_days", label: "is within the next … days", types: ["date"], needsValue: true },
  { value: "within_last_days", label: "is within the last … days", types: ["date"], needsValue: true },
  { value: "is_true", label: "is yes", types: ["bool"], needsValue: false },
  { value: "is_false", label: "is no", types: ["bool"], needsValue: false },
  { value: "is_empty", label: "is blank", types: ["text", "enum", "number", "date"], needsValue: false },
  { value: "not_empty", label: "is filled in", types: ["text", "enum", "number", "date"], needsValue: false },
];
export type Operator =
  | "is"
  | "is_not"
  | "contains"
  | "gte"
  | "lte"
  | "before"
  | "after"
  | "past"
  | "within_next_days"
  | "within_last_days"
  | "is_true"
  | "is_false"
  | "is_empty"
  | "not_empty";

export interface Filter {
  field: string;
  op: Operator;
  value?: string;
}

export type Show = "table" | "summary" | "both";

export interface Section {
  id: string;
  title: string;
  note?: string;
  source: string;
  period: Period;
  filters: Filter[];
  columns: string[];
  sort: { field: string; dir: "asc" | "desc" } | null;
  /** A field to group by; a date field groups by month. */
  groupBy: string | null;
  /** The table, a count per group, or both. Without a grouping, the table. */
  show: Show;
  /** A bar chart of the count per group. Needs a grouping. */
  chart: boolean;
  /** At most this many rows in the table (the count still covers them all). */
  limit: number | null;
}

export interface ReportDefinition {
  version: 1;
  sections: Section[];
}

export const MAX_SECTIONS = 20;
export const MAX_FILTERS = 10;
/** Rows a table shows on screen and in the PDF; Excel has them all. */
export const SCREEN_ROWS = 2000;

export const EMPTY_DEFINITION: ReportDefinition = { version: 1, sections: [] };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function newSectionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** A section made from a source, with its default columns. */
export function newSection(source: string): Section {
  const def = sourceDef(source);
  return {
    id: newSectionId(),
    title: def?.label ?? "Section",
    source,
    period: "all",
    filters: [],
    columns: def?.defaultColumns ?? [],
    sort: null,
    groupBy: null,
    show: "table",
    chart: false,
    limit: null,
  };
}

/** Read a section, dropping whatever the catalogue doesn't know. Null when the source is unknown. */
function parseSection(raw: unknown): Section | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const source = sourceDef(str(r.source, 50));
  if (!source) return null;
  const known = (k: unknown) => typeof k === "string" && !!fieldDef(source, k);

  const filters: Filter[] = (Array.isArray(r.filters) ? r.filters : [])
    .flatMap((f): Filter[] => {
      if (!f || typeof f !== "object") return [];
      const x = f as Record<string, unknown>;
      const field = typeof x.field === "string" ? fieldDef(source, x.field) : undefined;
      const op = OPERATORS.find((o) => o.value === x.op);
      if (!field || !op || !op.types.includes(field.type)) return [];
      const value = str(x.value, 200);
      if (op.needsValue && !value) return [];
      return [{ field: field.key, op: op.value, ...(op.needsValue ? { value } : {}) }];
    })
    .slice(0, MAX_FILTERS);

  const columns = [...new Set((Array.isArray(r.columns) ? r.columns : []).filter(known) as string[])];
  const s = r.sort as Record<string, unknown> | null | undefined;
  const sort = s && known(s.field) ? { field: s.field as string, dir: s.dir === "desc" ? ("desc" as const) : ("asc" as const) } : null;
  const groupBy = known(r.groupBy) ? (r.groupBy as string) : null;
  const show: Show = groupBy && (r.show === "summary" || r.show === "both") ? r.show : "table";
  const limit = Number.isInteger(r.limit) && (r.limit as number) > 0 ? Math.min(r.limit as number, SCREEN_ROWS) : null;
  const period = PERIODS.find((p) => p.value === r.period)?.value ?? "all";

  return {
    id: str(r.id, 20) || newSectionId(),
    title: str(r.title, 150) || source.label,
    ...(str(r.note, 1000) ? { note: str(r.note, 1000) } : {}),
    source: source.key,
    period: source.periodField ? period : "all",
    filters,
    columns: columns.length > 0 ? columns : source.defaultColumns,
    sort,
    groupBy,
    show,
    chart: !!groupBy && r.chart === true,
    limit,
  };
}

export function parseDefinition(raw: unknown): ReportDefinition {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sections = (Array.isArray(r.sections) ? r.sections : [])
    .map(parseSection)
    .filter((s): s is Section => s !== null)
    .slice(0, MAX_SECTIONS);
  // Ids must be unique: React keys and the Excel sheets rely on it.
  const seen = new Set<string>();
  for (const s of sections) {
    if (seen.has(s.id)) s.id = newSectionId();
    seen.add(s.id);
  }
  return { version: 1, sections };
}

/** The ISO day range a period covers, from today in UK time. */
export function periodRange(period: Period, today: string): { from: string | null; to: string | null } {
  const [y, m] = today.split("-").map(Number);
  const day = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd, 12)).toISOString().slice(0, 10);
  const shift = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const q = Math.floor((m - 1) / 3);
  switch (period) {
    case "all":
      return { from: null, to: null };
    case "last_7_days":
      return { from: shift(-6), to: today };
    case "last_30_days":
      return { from: shift(-29), to: today };
    case "last_90_days":
      return { from: shift(-89), to: today };
    case "last_12_months":
      return { from: day(y - 1, m, Number(today.slice(8)) + 1), to: today };
    case "this_month":
      return { from: day(y, m, 1), to: day(y, m + 1, 0) };
    case "last_month":
      return { from: day(y, m - 1, 1), to: day(y, m, 0) };
    case "this_quarter":
      return { from: day(y, q * 3 + 1, 1), to: day(y, q * 3 + 4, 0) };
    case "last_quarter":
      return { from: day(y, q * 3 - 2, 1), to: day(y, q * 3 + 1, 0) };
    case "this_year":
      return { from: day(y, 1, 1), to: day(y, 12, 31) };
    case "last_year":
      return { from: day(y - 1, 1, 1), to: day(y - 1, 12, 31) };
    case "next_30_days":
      return { from: today, to: shift(29) };
    case "next_90_days":
      return { from: today, to: shift(89) };
  }
}

export function periodLabel(period: string): string {
  return PERIODS.find((p) => p.value === period)?.label ?? period;
}

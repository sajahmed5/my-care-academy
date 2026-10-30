/**
 * Turn a section's rows into what a report shows: filtered, sorted, grouped
 * and counted (BESPOKE-REPORTS.md). Pure — the rows come from
 * lib/bespoke/load.ts — so the same answer is drawn on screen, in the PDF, in
 * Excel and in the scheduled email, and it is tested without a database.
 */

import { fieldDef, optionLabel, sourceDef, type FieldDef } from "./catalogue";
import { periodLabel, periodRange, SCREEN_ROWS, type Filter, type Section } from "./definition";
import { formatDate } from "@/lib/dates";

export type Value = string | number | boolean | null;
export type Row = Record<string, Value>;

export type Column = Pick<FieldDef, "key" | "label" | "type" | "options">;

export interface Group {
  label: string;
  count: number;
  rows: Value[][];
}

export interface SectionResult {
  id: string;
  title: string;
  note: string | null;
  /** "Training assignments · The last 30 days · 2 filters" */
  basis: string;
  /** Set when the package leaves the source out: nothing else is filled in. */
  unavailable: boolean;
  columns: Column[];
  /** Every row that matched, however many are shown. */
  total: number;
  /** The table, ungrouped. Empty when grouped. */
  rows: Value[][];
  /** The table, under a heading per group. Null without a grouping. */
  groups: Group[] | null;
  /** A count per group. Null without a grouping or when the table alone is shown. */
  summary: { label: string; count: number; percent: number }[] | null;
  showTable: boolean;
  chart: boolean;
  /** Rows were left out of the table to keep it readable. */
  truncated: boolean;
}

const BLANK = "(blank)";
const isBlank = (v: Value) => v === null || v === "";

/** One value as it reads in a report. */
export function formatValue(field: Column | FieldDef, v: Value): string {
  if (isBlank(v)) return "";
  switch (field.type) {
    case "date":
      return formatDate(`${String(v).slice(0, 10)}T12:00:00Z`);
    case "bool":
      return v ? "Yes" : "No";
    case "enum":
      return optionLabel(field, String(v));
    case "number":
      return typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v);
    default:
      return String(v);
  }
}

const dayOf = (v: Value) => (isBlank(v) ? null : String(v).slice(0, 10));
const plusDays = (today: string, n: number) =>
  new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function matches(row: Row, filter: Filter, field: FieldDef, today: string): boolean {
  const v = row[filter.field] ?? null;
  const want = filter.value ?? "";
  switch (filter.op) {
    case "is_empty":
      return isBlank(v);
    case "not_empty":
      return !isBlank(v);
    case "is_true":
      return v === true;
    case "is_false":
      return v === false;
    case "is":
    case "is_not": {
      const same =
        field.type === "number"
          ? !isBlank(v) && Number(v) === Number(want)
          : String(v ?? "").toLowerCase() === want.toLowerCase();
      return filter.op === "is" ? same : !same;
    }
    case "contains":
      return String(v ?? "").toLowerCase().includes(want.toLowerCase());
    case "gte":
      return !isBlank(v) && Number(v) >= Number(want);
    case "lte":
      return !isBlank(v) && Number(v) <= Number(want);
    case "before":
      return dayOf(v) !== null && dayOf(v)! < want;
    case "after":
      return dayOf(v) !== null && dayOf(v)! > want;
    case "past":
      return dayOf(v) !== null && dayOf(v)! < today;
    case "within_next_days":
      return dayOf(v) !== null && dayOf(v)! >= today && dayOf(v)! <= plusDays(today, Number(want) || 0);
    case "within_last_days":
      return dayOf(v) !== null && dayOf(v)! <= today && dayOf(v)! >= plusDays(today, -(Number(want) || 0));
  }
}

function compare(a: Value, b: Value): number {
  if (isBlank(a) && isBlank(b)) return 0;
  if (isBlank(a)) return 1; // blanks last, whichever way
  if (isBlank(b)) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(b) - Number(a);
  return String(a).localeCompare(String(b), "en-GB", { sensitivity: "base", numeric: true });
}

/** The group a value falls in: a month for a date, the label otherwise. */
function groupKey(field: FieldDef, v: Value): { key: string; label: string; order: string | number } {
  if (isBlank(v)) return { key: BLANK, label: BLANK, order: "￿" };
  if (field.type === "date") {
    const month = String(v).slice(0, 7);
    return { key: month, label: formatDate(`${month}-15T12:00:00Z`, { month: "long", year: "numeric" }), order: month };
  }
  if (field.type === "enum") {
    const i = field.options?.findIndex((o) => o.value === v) ?? -1;
    return { key: String(v), label: optionLabel(field, String(v)), order: i < 0 ? 9999 : i };
  }
  const label = formatValue(field, v);
  return { key: label, label, order: field.type === "bool" ? (v ? 0 : 1) : label.toLowerCase() };
}

/**
 * Run one section over its rows. `rows` null means the company's package
 * doesn't include the source. `allRows` lifts the on-screen cap, for Excel.
 */
export function runSection(
  section: Section,
  rows: Row[] | null,
  today: string,
  { allRows = false }: { allRows?: boolean } = {},
): SectionResult {
  const source = sourceDef(section.source)!;
  const periodText = source.periodField && section.period !== "all" ? periodLabel(section.period) : null;
  const filterText = section.filters.length ? `${section.filters.length} filter${section.filters.length === 1 ? "" : "s"}` : null;
  const base: SectionResult = {
    id: section.id,
    title: section.title,
    note: section.note ?? null,
    basis: [source.label, periodText, filterText].filter(Boolean).join(" · "),
    unavailable: rows === null,
    columns: section.columns.flatMap((k) => {
      const f = fieldDef(source, k);
      return f ? [{ key: f.key, label: f.label, type: f.type, options: f.options }] : [];
    }),
    total: 0,
    rows: [],
    groups: null,
    summary: null,
    showTable: section.show !== "summary",
    chart: section.chart,
    truncated: false,
  };
  if (rows === null) return base;

  // The period, then the filters.
  let kept = rows;
  if (source.periodField && section.period !== "all") {
    const { from, to } = periodRange(section.period, today);
    const key = source.periodField;
    kept = kept.filter((r) => {
      const d = dayOf(r[key] ?? null);
      return d !== null && (!from || d >= from) && (!to || d <= to);
    });
  }
  for (const f of section.filters) {
    const field = fieldDef(source, f.field);
    if (field) kept = kept.filter((r) => matches(r, f, field, today));
  }

  if (section.sort) {
    const { field, dir } = section.sort;
    kept = [...kept].sort((a, b) => {
      const c = compare(a[field] ?? null, b[field] ?? null);
      // Blanks stay last when descending too.
      return dir === "desc" && !isBlank(a[field] ?? null) && !isBlank(b[field] ?? null) ? -c : c;
    });
  }

  const cap = allRows ? Infinity : (section.limit ?? SCREEN_ROWS);
  const toCells = (r: Row) => base.columns.map((c) => r[c.key] ?? null);
  base.total = kept.length;

  const groupField = section.groupBy ? fieldDef(source, section.groupBy) : undefined;
  if (!groupField) {
    base.rows = kept.slice(0, cap).map(toCells);
    base.truncated = kept.length > base.rows.length;
    return base;
  }

  const buckets = new Map<string, { label: string; order: string | number; rows: Row[] }>();
  for (const r of kept) {
    const g = groupKey(groupField, r[groupField.key] ?? null);
    const b = buckets.get(g.key) ?? { label: g.label, order: g.order, rows: [] };
    b.rows.push(r);
    buckets.set(g.key, b);
  }
  const ordered = [...buckets.values()].sort((a, b) =>
    typeof a.order === "number" && typeof b.order === "number"
      ? a.order - b.order
      : String(a.order).localeCompare(String(b.order), "en-GB", { numeric: true }),
  );

  let left = cap;
  base.groups = ordered.map((b) => {
    const shown = b.rows.slice(0, Math.max(0, left));
    left -= shown.length;
    return { label: b.label, count: b.rows.length, rows: shown.map(toCells) };
  });
  base.truncated = left < 0 || base.groups.some((g) => g.rows.length < g.count);
  if (section.show !== "table" || section.chart) {
    base.summary = ordered.map((b) => ({
      label: b.label,
      count: b.rows.length,
      percent: kept.length ? Math.round((b.rows.length / kept.length) * 1000) / 10 : 0,
    }));
  }
  return base;
}

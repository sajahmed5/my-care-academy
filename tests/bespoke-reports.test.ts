import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { SOURCES, sourceDef } from "../lib/bespoke/catalogue";
import { newSection, parseDefinition, periodRange, type Section } from "../lib/bespoke/definition";
import { formatValue, runSection, type Row } from "../lib/bespoke/run";
import { buildXlsx, columnName, excelDate, sheetNames } from "../lib/bespoke/xlsx-write";
import { reportFilename, reportSheets } from "../lib/bespoke/excel";
import { xlsxToCsv } from "../lib/xlsx";

const TODAY = "2026-10-30";

const rows: Row[] = [
  { person: "Ann", person_role: "learner", person_status: "active", course: "Fire Safety", status: "completed", overdue: false, due_date: "2026-09-01", assigned_at: "2026-08-01", progress: 100, time_spent: 30, completions: 1 },
  { person: "Bob", person_role: "learner", person_status: "active", course: "Fire Safety", status: "not_started", overdue: true, due_date: "2026-10-01", assigned_at: "2026-10-05", progress: 0, time_spent: null, completions: 0 },
  { person: "Cat", person_role: "org_office", person_status: "active", course: "Medication", status: "in_progress", overdue: false, due_date: "2026-11-10", assigned_at: "2026-10-20", progress: 40, time_spent: 12, completions: 0 },
  { person: "Dan", person_role: "learner", person_status: "deactivated", course: "Medication", status: "not_started", overdue: false, due_date: null, assigned_at: "2025-12-01", progress: 0, time_spent: null, completions: 0 },
];

const section = (patch: Partial<Section>): Section => ({ ...newSection("training"), ...patch });

describe("the catalogue", () => {
  it("has unique sources and fields, with valid defaults and periods", () => {
    expect(new Set(SOURCES.map((s) => s.key)).size).toBe(SOURCES.length);
    for (const s of SOURCES) {
      const keys = s.fields.map((f) => f.key);
      expect(new Set(keys).size, s.key).toBe(keys.length);
      for (const c of s.defaultColumns) expect(keys, `${s.key}.${c}`).toContain(c);
      if (s.periodField) expect(s.fields.find((f) => f.key === s.periodField)?.type, s.key).toBe("date");
      for (const f of s.fields) if (f.type === "enum") expect(f.options?.length, `${s.key}.${f.key}`).toBeGreaterThan(0);
    }
  });
});

describe("reading a saved definition", () => {
  it("drops what the catalogue doesn't know, so an old report never throws", () => {
    const d = parseDefinition({
      sections: [
        { source: "nonsense" },
        {
          id: "a",
          source: "training",
          columns: ["person", "gone", "person"],
          filters: [
            { field: "status", op: "is", value: "completed" },
            { field: "status", op: "is_true" }, // wrong type for the field
            { field: "gone", op: "is", value: "x" },
            { field: "course", op: "contains", value: "" }, // needs a value
          ],
          sort: { field: "gone", dir: "desc" },
          groupBy: "course",
          show: "summary",
          chart: true,
          period: "last_30_days",
          limit: 99999,
        },
      ],
    });
    expect(d.sections).toHaveLength(1);
    const s = d.sections[0];
    expect(s.columns).toEqual(["person"]);
    expect(s.filters).toEqual([{ field: "status", op: "is", value: "completed" }]);
    expect(s.sort).toBeNull();
    expect(s).toMatchObject({ groupBy: "course", show: "summary", chart: true, period: "last_30_days", limit: 2000 });
  });

  it("takes the chart and summary away without a grouping", () => {
    const s = parseDefinition({ sections: [{ source: "training", show: "summary", chart: true }] }).sections[0];
    expect(s).toMatchObject({ groupBy: null, show: "table", chart: false });
    expect(s.columns).toEqual(sourceDef("training")!.defaultColumns);
  });

  it("works out periods from today", () => {
    expect(periodRange("last_month", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("this_quarter", TODAY)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(periodRange("last_quarter", TODAY)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(periodRange("last_30_days", TODAY)).toEqual({ from: "2026-10-01", to: TODAY });
    expect(periodRange("last_12_months", TODAY)).toEqual({ from: "2025-10-31", to: TODAY });
    expect(periodRange("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("running a section", () => {
  it("filters, sorts and shows the chosen columns", () => {
    const r = runSection(
      section({
        columns: ["person", "status"],
        filters: [{ field: "status", op: "is_not", value: "completed" }],
        sort: { field: "person", dir: "desc" },
      }),
      rows,
      TODAY,
    );
    expect(r.total).toBe(3);
    expect(r.rows).toEqual([
      ["Dan", "not_started"],
      ["Cat", "in_progress"],
      ["Bob", "not_started"],
    ]);
    expect(r.columns.map((c) => c.label)).toEqual(["Name", "Status"]);
    expect(formatValue(r.columns[1], "in_progress")).toBe("In progress");
  });

  it("applies the period to the source's own date", () => {
    const r = runSection(section({ period: "last_30_days" }), rows, TODAY);
    expect(r.total).toBe(2); // assigned 5 Oct and 20 Oct
    expect(r.basis).toBe("Training assignments · The last 30 days");
  });

  it("filters on dates relative to today, and keeps blanks out", () => {
    const due = (op: Section["filters"][number]) => runSection(section({ filters: [op] }), rows, TODAY).total;
    expect(due({ field: "due_date", op: "past" })).toBe(2);
    expect(due({ field: "due_date", op: "within_next_days", value: "14" })).toBe(1);
    expect(due({ field: "due_date", op: "is_empty" })).toBe(1);
    expect(due({ field: "overdue", op: "is_true" })).toBe(1);
    expect(due({ field: "progress", op: "gte", value: "40" })).toBe(2);
    expect(due({ field: "course", op: "contains", value: "fire" })).toBe(2);
  });

  it("groups and counts, enums in their own order and dates by month", () => {
    const byStatus = runSection(section({ groupBy: "status", show: "both", chart: true }), rows, TODAY);
    expect(byStatus.summary).toEqual([
      { label: "Not started", count: 2, percent: 50 },
      { label: "In progress", count: 1, percent: 25 },
      { label: "Completed", count: 1, percent: 25 },
    ]);
    expect(byStatus.groups?.map((g) => g.rows.length)).toEqual([2, 1, 1]);

    const byMonth = runSection(section({ groupBy: "due_date", show: "summary" }), rows, TODAY);
    expect(byMonth.summary?.map((g) => g.label)).toEqual(["September 2026", "October 2026", "November 2026", "(blank)"]);
    expect(byMonth.showTable).toBe(false);
  });

  it("caps the table but not the count, and lifts the cap for Excel", () => {
    expect(runSection(section({ limit: 2 }), rows, TODAY)).toMatchObject({ total: 4, truncated: true });
    expect(runSection(section({ limit: 2 }), rows, TODAY).rows).toHaveLength(2);
    expect(runSection(section({ limit: 2 }), rows, TODAY, { allRows: true }).rows).toHaveLength(4);
    const grouped = runSection(section({ limit: 3, groupBy: "course" }), rows, TODAY);
    expect(grouped.groups?.map((g) => [g.count, g.rows.length])).toEqual([
      [2, 2],
      [2, 1],
    ]);
    expect(grouped.truncated).toBe(true);
  });

  it("says when the package leaves the source out", () => {
    const r = runSection(newSection("audits"), null, TODAY);
    expect(r).toMatchObject({ unavailable: true, total: 0 });
  });
});

describe("the Excel file", () => {
  it("names columns and dates the way Excel does", () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA"]);
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-10-30")).toBe(46325);
    expect(sheetNames(["A/B", "a/b", "x".repeat(40), ""])).toEqual(["A B", "a b (2)", "x".repeat(31), "Sheet"]);
  });

  it("reads back what was written", async () => {
    const bytes = await buildXlsx([
      { name: "One", rows: [["Name", "Due", "Count", "Done"], ["Ann & <Bob>", { date: "2026-10-30" }, 3, true], [null, null, 1.5, false]] },
    ]);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).every((n) => !n.endsWith("/"))).toBe(true);
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet).toContain('<c r="B2" s="2"><v>46325</v></c>');
    const { csv } = await xlsxToCsv(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(csv?.split("\n")[1]).toContain("Ann & <Bob>");
  });

  it("puts every row of a grouped section on a flat sheet, group first", () => {
    const s = runSection(section({ groupBy: "course", columns: ["person", "due_date"], show: "both", limit: 1 }), rows, TODAY, { allRows: true });
    const sheets = reportSheets({ title: "T", description: null, sections: [s] }, "Demo", new Date("2026-10-30T09:00:00Z"));
    expect(sheets.map((x) => x.name)).toEqual(["About", "Training assignments summary", "Training assignments"]);
    expect(sheets[2].rows[0]).toEqual(["Group", "Name", "Due"]);
    expect(sheets[2].rows).toHaveLength(5);
    expect(sheets[2].rows[1]).toEqual(["Fire Safety", "Ann", { date: "2026-09-01" }]);
  });

  it("makes a filename that can be saved", () => {
    expect(reportFilename('CQC: "monthly" / staff', TODAY, "pdf")).toBe("CQC monthly staff 2026-10-30.pdf");
  });
});

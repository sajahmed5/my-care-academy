import { describe, expect, it } from "vitest";
import { lineFlagged, logCell, logColumns, logCsv, type LogEntry } from "@/lib/form-logs";
import { isOutOfRange, rangeLabel, type FormField } from "@/lib/forms";

const field = (over: Partial<FormField>): FormField => ({
  id: "x",
  label: "X",
  type: "text",
  options: [],
  required: false,
  conditional: null,
  sort_order: 0,
  ...over,
});

const fields: FormField[] = [
  field({ id: "kind", label: "Which", type: "radio", options: ["Fridge", "Freezer"], sort_order: 0 }),
  field({ id: "tf", label: "Temperature", type: "number", min: 1, max: 5, conditional: { whenFieldId: "kind", equals: "Fridge" }, sort_order: 1 }),
  field({ id: "tz", label: "Temperature", type: "number", max: -18, conditional: { whenFieldId: "kind", equals: "Freezer" }, sort_order: 2 }),
  field({ id: "sig", label: "Signed", type: "signature", sort_order: 3 }),
];

const entry = (answers: Record<string, unknown>): LogEntry => ({
  id: "e1",
  entry_date: "2026-10-30",
  done_by: null,
  person: "Sam",
  client_id: null,
  client_name: null,
  answers,
  recorded_by: "u1",
  recorded_by_name: "Sam",
  created_at: "2026-10-30T09:00:00Z",
});

describe("ranges", () => {
  it("flags a number outside its range, and nothing else", () => {
    expect(isOutOfRange(fields[1], "8")).toBe(true);
    expect(isOutOfRange(fields[1], "3")).toBe(false);
    expect(isOutOfRange(fields[2], -12)).toBe(true);
    expect(isOutOfRange(fields[2], "")).toBe(false);
    expect(isOutOfRange(field({ type: "text", max: 1 }), "9")).toBe(false);
  });

  it("says the range as a reader would", () => {
    expect(rangeLabel({ min: 1, max: 5 })).toBe("1 to 5");
    expect(rangeLabel({ max: -18 })).toBe("-18 or below");
    expect(rangeLabel({})).toBeNull();
  });
});

describe("log columns", () => {
  it("merges fields that share a label, and leaves signatures out", () => {
    expect(logColumns(fields).map((c) => [c.label, c.fields.length])).toEqual([
      ["Which", 1],
      ["Temperature", 2],
    ]);
  });

  it("reads the answer to whichever field was asked, flagged when out of range", () => {
    const temp = logColumns(fields)[1];
    expect(logCell(temp, { kind: "Freezer", tz: "-20" })).toEqual({ text: "-20", flagged: false });
    expect(logCell(temp, { kind: "Fridge", tf: "7" })).toEqual({ text: "7", flagged: true });
    expect(lineFlagged(fields, { kind: "Fridge", tf: "7" })).toBe(true);
    // A hidden field's stale answer is not read.
    expect(lineFlagged(fields, { kind: "Freezer", tf: "7", tz: "-19" })).toBe(false);
  });
});

describe("logCsv", () => {
  it("writes a header and a row, keeping negative numbers as numbers and defusing formulas", () => {
    const csv = logCsv([entry({ kind: "Freezer", tz: "-12" }), entry({ kind: "=HYPERLINK()" })], fields, { personLabel: "Checked by", withClient: false });
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Date,Checked by,Which,Temperature,Out of range,Recorded by");
    expect(lines[1]).toBe("2026-10-30,Sam,Freezer,-12,Yes,Sam");
    expect(lines[2]).toContain(`"'=HYPERLINK()"`);
  });
});

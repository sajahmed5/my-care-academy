import { describe, expect, it } from "vitest";
import { catalogueText, draftToDefinition, reportPrompt, REPORT_DRAFT_SCHEMA, type ReportDraft } from "../lib/bespoke/ai";
import { SOURCES } from "../lib/bespoke/catalogue";

const section = (patch: Partial<ReportDraft["sections"][number]>): ReportDraft["sections"][number] => ({
  title: "Overdue training",
  note: "",
  source: "training",
  period: "all",
  filters: [{ field: "overdue", op: "is_true", value: "" }],
  columns: ["person", "course", "due_date"],
  sortField: "due_date",
  sortDir: "asc",
  groupBy: "course",
  show: "both",
  chart: true,
  ...patch,
});

describe("the AI draft of a report", () => {
  it("is offered every source and field, with enum values", () => {
    const text = catalogueText();
    for (const s of SOURCES) expect(text).toContain(`source "${s.key}"`);
    expect(text).toContain("in_progress (In progress)");
    const prompt = reportPrompt({ company: "Demo Care", request: "Who is overdue?", brief: "By course", today: "2026-10-30" });
    expect(prompt).toContain("Who is overdue?");
    expect(prompt).toContain("Notes from our staff:\nBy course");
    expect(REPORT_DRAFT_SCHEMA.properties.sections.items.properties.source.enum).toHaveLength(SOURCES.length);
  });

  it("becomes a definition the builder accepts", () => {
    const d = draftToDefinition({ title: "T", description: "D", cannot: "", sections: [section({})] });
    expect(d.sections[0]).toMatchObject({
      source: "training",
      filters: [{ field: "overdue", op: "is_true" }],
      sort: { field: "due_date", dir: "asc" },
      groupBy: "course",
      show: "both",
      chart: true,
    });
  });

  it("loses whatever it made up", () => {
    const d = draftToDefinition({
      title: "T",
      description: "D",
      cannot: "Rota hours aren't held here.",
      sections: [
        section({ source: "rotas" }),
        section({ columns: ["person", "shoe_size"], groupBy: "", sortField: "", show: "summary", chart: true, filters: [{ field: "nope", op: "is", value: "x" }] }),
      ],
    });
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0]).toMatchObject({ columns: ["person"], groupBy: null, sort: null, show: "table", chart: false, filters: [] });
  });
});

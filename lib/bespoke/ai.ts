/**
 * AI helps us build a bespoke report (BESPOKE-REPORTS.md): from what the
 * company asked for, a first draft of the definition for us to check and
 * change in the builder before anything is saved. It only ever chooses from
 * the catalogue; whatever it can't express is said in `cannot`, for us to
 * build by hand. Pure: the prompt, the schema and the reading of the answer.
 */

import { SOURCES } from "./catalogue";
import { OPERATORS, PERIODS, parseDefinition, type ReportDefinition } from "./definition";

export const REPORT_DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          note: { type: "string" },
          source: { type: "string", enum: SOURCES.map((s) => s.key) },
          period: { type: "string", enum: PERIODS.map((p) => p.value) },
          filters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                op: { type: "string", enum: OPERATORS.map((o) => o.value) },
                value: { type: "string" },
              },
              required: ["field", "op", "value"],
              additionalProperties: false,
            },
          },
          columns: { type: "array", items: { type: "string" } },
          sortField: { type: "string" },
          sortDir: { type: "string", enum: ["asc", "desc"] },
          groupBy: { type: "string" },
          show: { type: "string", enum: ["table", "summary", "both"] },
          chart: { type: "boolean" },
        },
        required: ["title", "note", "source", "period", "filters", "columns", "sortField", "sortDir", "groupBy", "show", "chart"],
        additionalProperties: false,
      },
    },
    cannot: { type: "string" },
  },
  required: ["title", "description", "sections", "cannot"],
  additionalProperties: false,
} as const;

export interface ReportDraft {
  title: string;
  description: string;
  sections: {
    title: string;
    note: string;
    source: string;
    period: string;
    filters: { field: string; op: string; value: string }[];
    columns: string[];
    sortField: string;
    sortDir: "asc" | "desc";
    groupBy: string;
    show: "table" | "summary" | "both";
    chart: boolean;
  }[];
  cannot: string;
}

/** The catalogue, as the model needs it: every source, field, type and value. */
export function catalogueText(): string {
  return SOURCES.map((s) => {
    const fields = s.fields
      .map((f) => {
        const values = f.options ? ` — values: ${f.options.map((o) => `${o.value} (${o.label})`).join(", ")}` : "";
        return `    - ${f.key}: ${f.label} [${f.type}]${values}`;
      })
      .join("\n");
    return `- source "${s.key}": ${s.label}. One row is ${s.row}.${s.periodField ? ` The period applies to ${s.periodField}.` : " No period."}\n${fields}`;
  }).join("\n");
}

export function reportPrompt(args: { company: string; request: string | null; brief: string; today: string }): string {
  const ops = OPERATORS.map((o) => `${o.value} (${o.label}; for ${o.types.join("/")}${o.needsValue ? "" : "; value \"\""})`).join(", ");
  return `You are helping My Care Academy's staff build a bespoke report for ${args.company}, a UK home-care company. Draft the report definition; a person will check it in the report builder before the company sees it.

What the company asked for:
${args.request?.trim() || "(no written request)"}

${args.brief.trim() ? `Notes from our staff:\n${args.brief.trim()}\n\n` : ""}Today is ${args.today}.

A report is one or more sections. Each section reads ONE source, then applies a period, filters, the columns shown (in order), a sort, an optional grouping with a count per group, and an optional bar chart of that count. Use only these sources and field keys:
${catalogueText()}

Periods: ${PERIODS.map((p) => p.value).join(", ")}.
Filter operators: ${ops}. Dates in filter values are YYYY-MM-DD; "within_next_days" and "within_last_days" take a number of days; enum filters take the value, not the label.
Grouping by a date field groups by month. "show" is "table" (rows under each group), "summary" (just the count per group) or "both". Use "" for no sort field or no grouping; "chart" needs a grouping.

Keep it to what was asked: usually one to four sections, a clear title for each, and the columns a reader needs. Write the title and description in plain British English for the company to read. If part of the request can't be built from these sources, leave it out of the sections and say what and why in "cannot" (otherwise "").`;
}

/** The model's draft, as a definition the builder accepts — anything unknown dropped. */
export function draftToDefinition(draft: ReportDraft): ReportDefinition {
  return parseDefinition({
    version: 1,
    sections: (draft.sections ?? []).map((s) => ({
      title: s.title,
      note: s.note,
      source: s.source,
      period: s.period,
      filters: s.filters,
      columns: s.columns,
      sort: s.sortField ? { field: s.sortField, dir: s.sortDir } : null,
      groupBy: s.groupBy || null,
      show: s.show,
      chart: s.chart,
      limit: null,
    })),
  });
}

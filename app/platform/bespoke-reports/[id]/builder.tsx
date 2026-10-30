"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOURCES, fieldDef, sourceDef, type FieldDef } from "@/lib/bespoke/catalogue";
import {
  MAX_FILTERS,
  MAX_SECTIONS,
  OPERATORS,
  PERIODS,
  newSection,
  type Filter,
  type ReportDefinition,
  type Section,
} from "@/lib/bespoke/definition";
import { saveReportAction } from "../actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-2 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * The report builder, ours only (BESPOKE-REPORTS.md): choose the data, the
 * period and filters, the columns, the sort, a grouping and a chart, section
 * by section, then save it to the one company it was built for. The preview
 * under it is the company's live data, run from what was last saved.
 */
export function Builder({
  reportId,
  initial,
}: {
  reportId: string;
  initial: { title: string; description: string; definition: ReportDefinition };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [sections, setSections] = useState<Section[]>(initial.definition.sections);
  const [adding, setAdding] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const touch = () => {
    setDirty(true);
    setMessage(null);
  };
  const update = (id: string, patch: Partial<Section>) => {
    touch();
    setSections((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const move = (i: number, by: number) => {
    touch();
    setSections((all) => {
      const next = [...all];
      const [s] = next.splice(i, 1);
      next.splice(i + by, 0, s);
      return next;
    });
  };

  const save = () =>
    start(async () => {
      const r = await saveReportAction(reportId, { title, description, definition: { version: 1, sections } });
      if (r.ok) {
        setDirty(false);
        setMessage({ ok: true, text: "Saved. The preview below shows it." });
        router.refresh();
      } else setMessage({ ok: false, text: r.error ?? "Something went wrong." });
    });

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="report-title">Report name</Label>
          <Input id="report-title" value={title} maxLength={150} onChange={(e) => (touch(), setTitle(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-description">What it shows (the company sees this)</Label>
          <textarea
            id="report-description"
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => (touch(), setDescription(e.target.value))}
            className={textareaClass}
          />
        </div>
      </div>

      {sections.map((s, i) => (
        <SectionEditor
          key={s.id}
          section={s}
          index={i}
          count={sections.length}
          onChange={(patch) => update(s.id, patch)}
          onMove={(by) => move(i, by)}
          onRemove={() => (touch(), setSections((all) => all.filter((x) => x.id !== s.id)))}
        />
      ))}

      {sections.length < MAX_SECTIONS && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed p-4">
          <div className="min-w-56 space-y-1.5">
            <Label htmlFor="add-source">Add a section from</Label>
            <select id="add-source" className={selectClass} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Choose the data…</option>
              {SOURCES.map((src) => (
                <option key={src.key} value={src.key}>
                  {src.label} — {src.row}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            disabled={!adding}
            onClick={() => {
              touch();
              setSections((all) => [...all, newSection(adding)]);
              setAdding("");
            }}
          >
            <Plus className="size-4" />
            Add section
          </Button>
        </div>
      )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t bg-background/95 py-3 backdrop-blur">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save report"}
        </Button>
        {dirty && !message && <span className="text-sm text-amber-700">Unsaved changes</span>}
        {message && <span className={`text-sm ${message.ok ? "text-teal-700" : "text-red-700"}`}>{message.text}</span>}
      </div>
    </div>
  );
}

function SectionEditor({
  section,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  section: Section;
  index: number;
  count: number;
  onChange: (patch: Partial<Section>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const source = sourceDef(section.source)!;
  const unused = source.fields.filter((f) => !section.columns.includes(f.key));
  const id = (k: string) => `${section.id}-${k}`;
  const groupField = section.groupBy ? fieldDef(source, section.groupBy) : undefined;

  const setColumns = (columns: string[]) => onChange({ columns });
  const setFilters = (filters: Filter[]) => onChange({ filters });

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Section {index + 1} · {source.label}
          </p>
          <p className="text-xs text-muted-foreground">One row is {source.row}.</p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Remove section" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={id("title")}>Heading</Label>
          <Input id={id("title")} value={section.title} maxLength={150} onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        {source.periodField && (
          <div className="space-y-1.5">
            <Label htmlFor={id("period")}>Period, by {fieldDef(source, source.periodField)?.label.toLowerCase()}</Label>
            <select
              id={id("period")}
              className={selectClass}
              value={section.period}
              onChange={(e) => onChange({ period: e.target.value as Section["period"] })}
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={id("note")}>A line under the heading (optional)</Label>
          <Input id={id("note")} value={section.note ?? ""} maxLength={1000} onChange={(e) => onChange({ note: e.target.value })} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Only rows where…</legend>
        {section.filters.length === 0 && <p className="text-xs text-muted-foreground">Every row, for now.</p>}
        {section.filters.map((f, i) => (
          <FilterRow
            key={i}
            fields={source.fields}
            filter={f}
            onChange={(next) => setFilters(section.filters.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setFilters(section.filters.filter((_, j) => j !== i))}
          />
        ))}
        {section.filters.length < MAX_FILTERS && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const first = source.fields[0];
              const op = OPERATORS.find((o) => o.types.includes(first.type))!;
              setFilters([...section.filters, { field: first.key, op: op.value, value: "" }]);
            }}
          >
            <Plus className="size-3.5" />
            Add a filter
          </Button>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Columns, in order</legend>
        <ol className="flex flex-wrap gap-2">
          {section.columns.map((k, i) => (
            <li key={k} className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 py-0.5 pl-2.5 pr-1 text-sm">
              {fieldDef(source, k)?.label ?? k}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Earlier"
                disabled={i === 0}
                onClick={() => {
                  const next = [...section.columns];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  setColumns(next);
                }}
              >
                <ArrowUp className="-rotate-90" />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Remove column" onClick={() => setColumns(section.columns.filter((c) => c !== k))}>
                <X />
              </Button>
            </li>
          ))}
        </ol>
        {unused.length > 0 && (
          <select
            aria-label="Add a column"
            className={`${selectClass} max-w-64`}
            value=""
            onChange={(e) => e.target.value && setColumns([...section.columns, e.target.value])}
          >
            <option value="">Add a column…</option>
            {unused.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={id("sort")}>Sort by</Label>
          <select
            id={id("sort")}
            className={selectClass}
            value={section.sort?.field ?? ""}
            onChange={(e) => onChange({ sort: e.target.value ? { field: e.target.value, dir: section.sort?.dir ?? "asc" } : null })}
          >
            <option value="">As read</option>
            {source.fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("dir")}>Order</Label>
          <select
            id={id("dir")}
            className={selectClass}
            disabled={!section.sort}
            value={section.sort?.dir ?? "asc"}
            onChange={(e) => section.sort && onChange({ sort: { ...section.sort, dir: e.target.value as "asc" | "desc" } })}
          >
            <option value="asc">A to Z, oldest, smallest first</option>
            <option value="desc">Z to A, newest, largest first</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("limit")}>At most this many rows</Label>
          <Input
            id={id("limit")}
            type="number"
            min={1}
            max={2000}
            placeholder="All (2,000 on screen)"
            value={section.limit ?? ""}
            onChange={(e) => onChange({ limit: e.target.value ? Math.max(1, Math.min(2000, Number(e.target.value))) : null })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={id("group")}>Group by</Label>
          <select
            id={id("group")}
            className={selectClass}
            value={section.groupBy ?? ""}
            onChange={(e) =>
              onChange(
                e.target.value ? { groupBy: e.target.value } : { groupBy: null, show: "table", chart: false },
              )
            }
          >
            <option value="">No grouping</option>
            {source.fields
              .filter((f) => f.type !== "number")
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                  {f.type === "date" ? " (by month)" : ""}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("show")}>Show</Label>
          <select
            id={id("show")}
            className={selectClass}
            disabled={!groupField}
            value={section.show}
            onChange={(e) => onChange({ show: e.target.value as Section["show"] })}
          >
            <option value="table">The rows, under each group</option>
            <option value="summary">Just the count per group</option>
            <option value="both">The count, then the rows</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            disabled={!groupField}
            checked={section.chart}
            onChange={(e) => onChange({ chart: e.target.checked })}
          />
          Bar chart of the count per group
        </label>
      </div>
    </div>
  );
}

function FilterRow({
  fields,
  filter,
  onChange,
  onRemove,
}: {
  fields: FieldDef[];
  filter: Filter;
  onChange: (f: Filter) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === filter.field) ?? fields[0];
  const ops = OPERATORS.filter((o) => o.types.includes(field.type));
  const op = ops.find((o) => o.value === filter.op) ?? ops[0];
  const days = op.value === "within_next_days" || op.value === "within_last_days";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Field"
        className={`${selectClass} w-auto min-w-40`}
        value={field.key}
        onChange={(e) => {
          const next = fields.find((f) => f.key === e.target.value)!;
          const nextOp = OPERATORS.find((o) => o.types.includes(next.type))!;
          onChange({ field: next.key, op: nextOp.value, value: "" });
        }}
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Condition"
        className={`${selectClass} w-auto`}
        value={op.value}
        onChange={(e) => onChange({ ...filter, field: field.key, op: e.target.value as Filter["op"] })}
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {op.needsValue &&
        (field.type === "enum" && !days ? (
          <select
            aria-label="Value"
            className={`${selectClass} w-auto min-w-40`}
            value={filter.value ?? ""}
            onChange={(e) => onChange({ ...filter, field: field.key, op: op.value, value: e.target.value })}
          >
            <option value="">Choose…</option>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            aria-label="Value"
            className="w-auto min-w-32"
            type={days || field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
            value={filter.value ?? ""}
            onChange={(e) => onChange({ ...filter, field: field.key, op: op.value, value: e.target.value })}
          />
        ))}
      <Button variant="ghost" size="icon-sm" aria-label="Remove filter" onClick={onRemove}>
        <X />
      </Button>
    </div>
  );
}

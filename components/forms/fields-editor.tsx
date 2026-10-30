"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FIELD_TYPES, fieldHasOptions, type FormField } from "@/lib/forms";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/**
 * A form's questions, edited as one list: label, type, required, options,
 * when it shows, and — for a number — the safe range a log flags. Used by
 * the platform library editor and by a company editing its own forms; the
 * list is saved whole as JSON and cleaned on the server (cleanFields).
 */
export function FieldsEditor({ fields, onChange }: { fields: FormField[]; onChange: (next: FormField[]) => void }) {
  const update = (i: number, patch: Partial<FormField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () =>
    onChange([
      ...fields,
      { id: crypto.randomUUID(), label: "", type: "text", options: [], required: false, conditional: null, sort_order: fields.length },
    ]);
  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Fields ({fields.length})</h3>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="size-4" /> Add field
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">No fields yet. Add the first question.</p>
      )}

      {fields.map((f, i) => (
        <div key={f.id} className="space-y-2 rounded-lg border p-3">
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
            <Input
              aria-label={`Field ${i + 1} label`}
              value={f.label}
              placeholder="Question"
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <select
              aria-label={`Field ${i + 1} type`}
              className={selectClass}
              value={f.type}
              onChange={(e) => update(i, { type: e.target.value as FormField["type"] })}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} aria-label="Move up">
                <ArrowUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} aria-label="Move down">
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(fields.filter((_, j) => j !== i))}
                aria-label="Remove field"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.required} onCheckedChange={(v) => update(i, { required: !!v })} />
              Required
            </label>
            {f.type === "number" && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                Safe range
                <Input
                  aria-label={`Field ${i + 1} lowest`}
                  type="number"
                  step="any"
                  className="h-8 w-20"
                  placeholder="from"
                  value={f.min ?? ""}
                  onChange={(e) => update(i, { min: num(e.target.value) })}
                />
                <Input
                  aria-label={`Field ${i + 1} highest`}
                  type="number"
                  step="any"
                  className="h-8 w-20"
                  placeholder="to"
                  value={f.max ?? ""}
                  onChange={(e) => update(i, { max: num(e.target.value) })}
                />
              </span>
            )}
            {fieldHasOptions(f.type) && (
              <Input
                aria-label={`Field ${i + 1} options`}
                className="sm:max-w-md"
                placeholder="Options, comma separated"
                value={f.options.join(", ")}
                onChange={(e) =>
                  update(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                }
              />
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              aria-label={`Field ${i + 1} shown when`}
              className={selectClass}
              value={f.conditional?.whenFieldId ?? ""}
              onChange={(e) =>
                update(i, {
                  conditional: e.target.value
                    ? { whenFieldId: e.target.value, equals: f.conditional?.equals ?? "" }
                    : null,
                })
              }
            >
              <option value="">Always shown</option>
              {fields
                .filter((o, j) => j !== i && o.label)
                .map((o) => (
                  <option key={o.id} value={o.id}>Only when “{o.label}” is…</option>
                ))}
            </select>
            {f.conditional && (
              <Input
                aria-label={`Field ${i + 1} shown when value`}
                placeholder="…this value"
                value={f.conditional.equals}
                onChange={(e) =>
                  update(i, { conditional: { whenFieldId: f.conditional!.whenFieldId, equals: e.target.value } })
                }
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

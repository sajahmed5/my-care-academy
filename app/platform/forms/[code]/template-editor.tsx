"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FIELD_TYPES, fieldHasOptions, type FormField } from "@/lib/forms";
import { FORM_CATEGORIES, type FormTemplateRecord } from "@/lib/form-library";
import { saveFormTemplateAction, setFormStatusAction } from "../actions";
import type { SaveState } from "@/app/platform/actions";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/**
 * Author a form: its details, its fields, and its status.
 *
 * Fields are edited as one list and saved as one JSON document, which is also
 * how they are stored. Saving changed fields bumps the version; the responses
 * already given keep the version they answered.
 */
export function TemplateEditor({ template }: { template: FormTemplateRecord }) {
  const [fields, setFields] = useState<FormField[]>(template.fields);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    saveFormTemplateAction,
    {},
  );
  const [statusState, statusAction, statusPending] = useActionState<SaveState, FormData>(
    setFormStatusAction,
    {},
  );

  function update(i: number, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }
  function move(i: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function add() {
    setFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: "",
        type: "text",
        options: [],
        required: false,
        conditional: null,
        sort_order: prev.length,
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 pt-6">
          {/* Unlabelled, this read as a mystery box (#55). */}
          <div>
            <p className="text-sm font-semibold">Who can see this form</p>
            <p className="text-xs text-muted-foreground">
              Published forms appear in the forms library of every organisation whose package includes it. Drafts and retired forms are hidden from organisations.
            </p>
          </div>
          <form action={statusAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="code" value={template.code} />
            <span className="text-sm text-muted-foreground">
              Currently <span className="font-medium text-foreground">{template.status}</span> ·
              version {template.version}
            </span>
            {template.status !== "published" && (
              <Button type="submit" name="status" value="published" size="sm" disabled={statusPending}>
                Publish
              </Button>
            )}
            {template.status === "published" && (
              <Button type="submit" name="status" value="draft" size="sm" variant="outline" disabled={statusPending}>
                Back to draft
              </Button>
            )}
            {template.status !== "retired" && (
              <Button type="submit" name="status" value="retired" size="sm" variant="ghost" disabled={statusPending}>
                Retire
              </Button>
            )}
            {statusState.error && <span className="text-sm text-rose-600">{statusState.error}</span>}
          </form>
        </CardContent>
      </Card>

      <form action={formAction} className="space-y-6">
        <input type="hidden" name="code" value={template.code} />
        <input type="hidden" name="fields" value={JSON.stringify(fields)} />

        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <div className="space-y-1">
                <Label htmlFor="te-title">Title</Label>
                <Input id="te-title" name="title" required defaultValue={template.title} maxLength={120} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="te-category">Category</Label>
                <select id="te-category" name="category" className={selectClass} defaultValue={template.category}>
                  {FORM_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="te-pack">Pack</Label>
                <select id="te-pack" name="pack" className={selectClass} defaultValue={template.pack}>
                  <option value="basic">CQC basics</option>
                  <option value="full">Full compliance pack</option>
                  <option value="addon">Add-on</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="te-desc">What it is for (optional)</Label>
              <Input id="te-desc" name="description" defaultValue={template.description ?? ""} maxLength={300} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
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
                      onClick={() => setFields((prev) => prev.filter((_, j) => j !== i))}
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
          </CardContent>
        </Card>

        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        {state.ok && <p className="text-sm text-teal-700">Saved.</p>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save form"}</Button>
      </form>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldsEditor } from "@/components/forms/fields-editor";
import { FORM_AUDIENCES, FORM_CATEGORIES, type FormTemplateRecord } from "@/lib/form-library";
import type { FormField } from "@/lib/forms";
import type { SaveState } from "@/app/platform/actions";
import { saveOwnFormAction, setOwnFormStatusAction } from "../actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/**
 * Edit one of the company's own forms: what it is, who it is about, how
 * often it is reviewed, its questions — and put it into use. Saving changed
 * questions makes a new version; what was filled in keeps the old one.
 */
export function OwnFormEditor({ template }: { template: FormTemplateRecord }) {
  const [fields, setFields] = useState<FormField[]>(template.fields);
  const [isLog, setIsLog] = useState(template.is_log);
  const [state, saveAction, saving] = useActionState<SaveState, FormData>(saveOwnFormAction, {});
  const [statusState, statusAction, statusPending] = useActionState<SaveState, FormData>(setOwnFormStatusAction, {});

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div>
            <p className="text-sm font-semibold">
              {template.status === "published" ? "In use" : template.status === "retired" ? "Retired" : "Draft — not in use yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {template.status === "published"
                ? "It is in your forms list. Changes you save apply to the next one filled in."
                : "Save your questions, then put it into use to add it to your forms list."}
            </p>
          </div>
          <form action={statusAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="code" value={template.code} />
            {template.status !== "published" && (
              <Button type="submit" name="status" value="published" size="sm" disabled={statusPending}>Put into use</Button>
            )}
            {template.status === "published" && (
              <Button type="submit" name="status" value="draft" size="sm" variant="outline" disabled={statusPending}>Take out of use</Button>
            )}
            {template.status !== "retired" && (
              <Button type="submit" name="status" value="retired" size="sm" variant="ghost" disabled={statusPending}>Retire</Button>
            )}
          </form>
          {statusState.error && <p className="w-full text-sm text-rose-600">{statusState.error}</p>}
        </CardContent>
      </Card>

      <form action={saveAction} className="space-y-6">
        <input type="hidden" name="code" value={template.code} />
        <input type="hidden" name="fields" value={JSON.stringify(fields)} />
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1">
                <Label htmlFor="of-title">Name</Label>
                <Input id="of-title" name="title" required maxLength={120} defaultValue={template.title} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="of-category">Filed under</Label>
                <select id="of-category" name="category" className={selectClass} defaultValue={template.category}>
                  {FORM_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="of-desc">What it is for (optional)</Label>
              <Input id="of-desc" name="description" maxLength={300} defaultValue={template.description ?? ""} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1">
                <Label htmlFor="of-audience">Who it is about</Label>
                <select id="of-audience" name="audience" className={selectClass} defaultValue={template.audience}>
                  {FORM_AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>{a.label.replace(/ forms$/, "")} — {a.hint.split(".")[0].toLowerCase()}</option>
                  ))}
                </select>
              </div>
              {!isLog && (
                <div className="space-y-1">
                  <Label htmlFor="of-review">Review every (months)</Label>
                  <Input id="of-review" name="reviewMonths" type="number" min={1} max={60} placeholder="Never" defaultValue={template.review_months ?? ""} />
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isLog" value="1" checked={isLog} onChange={(e) => setIsLog(e.target.checked)} />
                A log — a line added each time
              </label>
              {isLog && (
                <div className="space-y-1">
                  <Label htmlFor="of-person">The &ldquo;who&rdquo; column is called</Label>
                  <Input id="of-person" name="personLabel" placeholder="Done by" maxLength={40} defaultValue={template.log_person_label ?? ""} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <FieldsEditor fields={fields} onChange={setFields} />
          </CardContent>
        </Card>

        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        {state.ok && <p className="text-sm text-teal-700">Saved.</p>}
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </form>
    </div>
  );
}

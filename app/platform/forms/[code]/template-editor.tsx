"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldsEditor } from "@/components/forms/fields-editor";
import type { FormField } from "@/lib/forms";
import { FORM_AUDIENCES, FORM_CATEGORIES, type FormTemplateRecord } from "@/lib/form-library";
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
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1">
                <Label htmlFor="te-audience">Who it is about</Label>
                <select id="te-audience" name="audience" className={selectClass} defaultValue={template.audience}>
                  {FORM_AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>{a.label.replace(/ forms$/, "")} — {a.hint.split(".")[0].toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="te-review">Review every (months)</Label>
                <Input id="te-review" name="reviewMonths" type="number" min={1} max={60} placeholder="Never" defaultValue={template.review_months ?? ""} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isLog" value="1" defaultChecked={template.is_log} />
                A log — a line added each time
              </label>
              <div className="space-y-1">
                <Label htmlFor="te-person">On a log, the &ldquo;who&rdquo; column is called</Label>
                <Input id="te-person" name="personLabel" placeholder="Done by" defaultValue={template.log_person_label ?? ""} maxLength={40} />
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
            <FieldsEditor fields={fields} onChange={setFields} />
          </CardContent>
        </Card>

        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        {state.ok && <p className="text-sm text-teal-700">Saved.</p>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save form"}</Button>
      </form>
    </div>
  );
}

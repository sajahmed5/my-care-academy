"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  FIELD_TYPES,
  fieldHasOptions,
  type FieldType,
  type FormField,
} from "@/lib/forms";
import {
  addFieldAction,
  updateFieldAction,
  deleteFieldAction,
  updateFormAction,
  type FieldInput,
} from "../actions";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

interface Draft {
  label: string;
  type: FieldType;
  optionsText: string;
  required: boolean;
  whenFieldId: string;
  equals: string;
}

function toInput(d: Draft): FieldInput {
  return {
    label: d.label,
    type: d.type,
    options: fieldHasOptions(d.type)
      ? d.optionsText.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    required: d.required,
    conditional: d.whenFieldId
      ? { whenFieldId: d.whenFieldId, equals: d.equals }
      : null,
  };
}

function FieldControls({
  draft,
  set,
  others,
}: {
  draft: Draft;
  set: (d: Draft) => void;
  others: { id: string; label: string }[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={draft.label}
          onChange={(e) => set({ ...draft, label: e.target.value })}
          placeholder="Field label"
        />
        <select
          value={draft.type}
          onChange={(e) => set({ ...draft, type: e.target.value as FieldType })}
          className={selectClass}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {fieldHasOptions(draft.type) && (
        <Input
          value={draft.optionsText}
          onChange={(e) => set({ ...draft, optionsText: e.target.value })}
          placeholder="Options, comma-separated"
        />
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={draft.required}
            onCheckedChange={(v) => set({ ...draft, required: v })}
          />
          Required
        </label>
      </div>

      <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Show only when</Label>
          <select
            value={draft.whenFieldId}
            onChange={(e) => set({ ...draft, whenFieldId: e.target.value })}
            className={selectClass}
          >
            <option value="">Always show</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Equals</Label>
          <Input
            value={draft.equals}
            onChange={(e) => set({ ...draft, equals: e.target.value })}
            disabled={!draft.whenFieldId}
            placeholder="value"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * One field already on the form. Its edits are held by the builder and saved
 * by the one Save at the bottom of the page (#67) — a Save per field beside a
 * "Save form" at the top meant edits were lost to whichever was pressed.
 */
function ExistingField({
  formId,
  field,
  draft,
  setDraft,
  dirty,
  others,
  onDeleted,
}: {
  formId: string;
  field: FormField;
  draft: Draft;
  setDraft: (d: Draft) => void;
  dirty: boolean;
  others: { id: string; label: string }[];
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className={`space-y-3 rounded-lg border p-4 ${dirty ? "border-amber-300" : ""}`}>
      <FieldControls draft={draft} set={setDraft} others={others} />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`Delete the field "${field.label}"?`)) return;
            setBusy(true);
            await deleteFieldAction(field.id, formId);
            onDeleted(field.id);
          }}
        >
          Delete
        </Button>
        {dirty && <span className="text-xs text-amber-700">Not saved yet</span>}
      </div>
    </div>
  );
}

function draftOf(field: FormField): Draft {
  return {
    label: field.label,
    type: field.type,
    optionsText: (field.options ?? []).join(", "),
    required: field.required,
    whenFieldId: field.conditional?.whenFieldId ?? "",
    equals: field.conditional?.equals ?? "",
  };
}

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

const emptyDraft: Draft = {
  label: "",
  type: "text",
  optionsText: "",
  required: false,
  whenFieldId: "",
  equals: "",
};

export function FormBuilder({
  formId,
  title,
  status,
  initialFields,
}: {
  formId: string;
  title: string;
  status: string;
  initialFields: FormField[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [formTitle, setFormTitle] = useState(title);
  const [published, setPublished] = useState(status === "published");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  // Every field's edits, against what was last saved, so the one Save at the
  // bottom knows exactly what to write.
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialFields.map((f) => [f.id, draftOf(f)])),
  );
  const [saved, setSaved] = useState<Record<string, Draft>>(drafts);
  const [savedDetails, setSavedDetails] = useState({ title, published: status === "published" });
  const [msg, setMsg] = useState<string | null>(null);

  const others = fields.map((f) => ({ id: f.id, label: f.label }));
  const dirtyIds = fields.map((f) => f.id).filter((id) => drafts[id] && saved[id] && !sameDraft(drafts[id], saved[id]));
  const detailsDirty = formTitle !== savedDetails.title || published !== savedDetails.published;
  const unsaved = detailsDirty || dirtyIds.length > 0;

  async function saveAll() {
    setBusy(true);
    setMsg(null);
    const errors: string[] = [];
    if (detailsDirty) {
      await updateFormAction(formId, { title: formTitle, status: published ? "published" : "draft" });
      setSavedDetails({ title: formTitle, published });
    }
    const nowSaved = { ...saved };
    for (const id of dirtyIds) {
      const r = await updateFieldAction(id, formId, toInput(drafts[id]));
      if (r.ok) nowSaved[id] = drafts[id];
      else errors.push(`${drafts[id].label || "A field"}: ${r.error ?? "could not save"}`);
    }
    setSaved(nowSaved);
    setBusy(false);
    setMsg(errors.length ? errors.join(" · ") : "Saved.");
    router.refresh();
  }

  async function addField() {
    if (!draft.label.trim()) return;
    setBusy(true);
    const r = await addFieldAction(formId, toInput(draft));
    setBusy(false);
    if (r.ok && r.id) {
      setFields((prev) => [
        ...prev,
        {
          id: r.id!,
          label: draft.label,
          type: draft.type,
          options: fieldHasOptions(draft.type)
            ? draft.optionsText.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          required: draft.required,
          conditional: draft.whenFieldId
            ? { whenFieldId: draft.whenFieldId, equals: draft.equals }
            : null,
          sort_order: prev.length,
        },
      ]);
      setDrafts((prev) => ({ ...prev, [r.id!]: draft }));
      setSaved((prev) => ({ ...prev, [r.id!]: draft }));
      setDraft(emptyDraft);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 space-y-2">
          <Label htmlFor="form-title">Form title</Label>
          <Input
            id="form-title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={published} onCheckedChange={setPublished} />
          Published
        </label>
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium">Fields ({fields.length})</p>
        {fields.map((f) => (
          <ExistingField
            key={f.id}
            formId={formId}
            field={f}
            draft={drafts[f.id] ?? draftOf(f)}
            setDraft={(d) => setDrafts((prev) => ({ ...prev, [f.id]: d }))}
            dirty={dirtyIds.includes(f.id)}
            others={others.filter((o) => o.id !== f.id)}
            onDeleted={(id) =>
              setFields((prev) => prev.filter((x) => x.id !== id))
            }
          />
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-dashed p-4">
        <p className="text-sm font-medium">Add a field</p>
        <FieldControls draft={draft} set={setDraft} others={others} />
        <Button onClick={addField} disabled={busy || !draft.label.trim()}>
          Add field
        </Button>
      </div>

      {/* The one Save, at the bottom (#67): the title, published, and every
          field edited above. */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button onClick={saveAll} disabled={busy || !unsaved}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {unsaved && !busy && (
          <span className="text-xs text-amber-700">
            Unsaved changes{dirtyIds.length ? ` to ${dirtyIds.length} field${dirtyIds.length === 1 ? "" : "s"}` : ""}.
          </span>
        )}
        {msg && !unsaved && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}

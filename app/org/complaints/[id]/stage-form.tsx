"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  visibleQuestions,
  withPeopleOptions,
  type AnswerMap,
  type AnswerValue,
  type Question,
  type StageForm as StageFormSchema,
} from "@/lib/complaints/schema";
import { requiredMissing } from "@/lib/complaints/stage-status";
import type { StaffOption } from "@/lib/complaints/data";
import { saveStageFormAction } from "../actions";
import { selectClass, textareaClass } from "../new-complaint";
import type { SaveState } from "@/app/platform/actions";

/**
 * A stage's form, rendered from its schema. Hidden questions are not drawn;
 * what is missing is said at the bottom, from the same rule that decides
 * whether the stage is done.
 */
export function StageForm({
  complaintId,
  stageId,
  schema,
  initial,
  staff,
  disabled,
  children,
}: {
  complaintId: string;
  stageId: string;
  schema: StageFormSchema;
  initial: AnswerMap;
  staff: StaffOption[];
  disabled: boolean;
  /** Anything that sits under the questions and above the save button. */
  children?: React.ReactNode;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(initial);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveStageFormAction, {});
  const form = withPeopleOptions(schema, staff.map((s) => ({ value: s.value, label: s.label })));
  const missing = requiredMissing(form, answers);
  const set = (id: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [id]: v }));

  // Only what the form owns is sent; the server keeps the rest of the entry.
  const owned: AnswerMap = {};
  for (const s of form.sections) for (const q of s.questions) if (q.id in answers) owned[q.id] = answers[q.id];

  return (
    <form
      // Submitted through a transition rather than <form action>: React resets
      // a form after a successful action, and a reset puts every <select> back
      // to the option it showed when the page loaded — the save lands, but the
      // dropdown snaps back on screen (#64).
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-5"
    >
      <input type="hidden" name="complaintId" value={complaintId} />
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="answers" value={JSON.stringify(owned)} />
      {[...form.sections]
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <fieldset key={section.id} className="space-y-3">
            <legend className="text-sm font-semibold">{section.title}</legend>
            {section.description && <p className="text-xs text-muted-foreground">{section.description}</p>}
            {visibleQuestions(section, answers).map((q) => (
              <QuestionField key={q.id} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} disabled={disabled} />
            ))}
          </fieldset>
        ))}
      {children}
      {missing.length > 0 && (
        <p className="text-xs text-amber-700">
          Still needed: {missing.join("; ")}.
        </p>
      )}
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && !state.error && <p className="text-sm text-teal-700">Saved.</p>}
      {!disabled && (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      )}
    </form>
  );
}

function QuestionField({ q, value, onChange, disabled }: { q: Question; value: AnswerValue; onChange: (v: AnswerValue) => void; disabled: boolean }) {
  const id = `q-${q.id}`;
  const label = (
    <Label htmlFor={id}>
      {q.text}
      {q.required && <span className="text-rose-600"> *</span>}
    </Label>
  );
  switch (q.type) {
    case "text":
      return (
        <div className="space-y-1">
          {label}
          <Input id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
        </div>
      );
    case "long_text":
      return (
        <div className="space-y-1">
          {label}
          <textarea id={id} rows={3} className={textareaClass} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
        </div>
      );
    case "date":
      return (
        <div className="space-y-1">
          {label}
          <Input id={id} type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
        </div>
      );
    case "select":
      return (
        <div className="space-y-1">
          {label}
          <select id={id} className={selectClass} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || undefined)} disabled={disabled}>
            <option value="">—</option>
            {(q.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      );
    case "multiselect": {
      const chosen = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1">
          {label}
          <div className="flex flex-wrap gap-2">
            {(q.options ?? []).map((o) => {
              const on = chosen.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(on ? chosen.filter((v) => v !== o.value) : [...chosen, o.value])}
                  className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "bg-background text-muted-foreground"}`}
                >
                  {o.label}
                </button>
              );
            })}
            {(q.options ?? []).length === 0 && <span className="text-xs text-muted-foreground">Nobody to pick from.</span>}
          </div>
        </div>
      );
    }
    case "yes_no":
      return (
        <div className="space-y-1">
          {label}
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                disabled={disabled}
                onClick={() => onChange(value === v ? undefined : v)}
                className={`rounded-lg border px-3 py-1 text-sm ${value === v ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "bg-background"}`}
              >
                {v ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
      );
  }
}

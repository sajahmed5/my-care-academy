"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Interval } from "@/lib/audit-forms";
import { QUESTION_TYPES, type AuditScope, type QuestionType, type ServiceQuestion } from "@/lib/service-audits";
import type { SaveState } from "@/app/platform/actions";
import { resetServiceFormAction, saveServiceFormAction } from "../actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/** A short id for a new question; answers are keyed by it, so it never changes. */
const newId = () => `q_${Math.random().toString(36).slice(2, 10)}`;

export interface EditorForm {
  key: string;
  label: string;
  scope: AuditScope;
  questions: ServiceQuestion[];
  due: Interval;
}

/**
 * One audit's name, due period and questions, each with its type. A question
 * keeps its id when reworded, so audits already done still read the same.
 */
export function ServiceFormEditor({
  initial,
  isNew,
  ours,
  changed,
}: {
  initial: EditorForm;
  isNew: boolean;
  ours: boolean;
  changed: boolean;
}) {
  const [questions, setQuestions] = useState<ServiceQuestion[]>(
    initial.questions.length ? initial.questions : [{ id: newId(), label: "", type: "yes_no" }],
  );
  const [state, action, pending] = useActionState<SaveState, FormData>(saveServiceFormAction, {});
  const [resetState, resetAction, resetting] = useActionState<SaveState, FormData>(resetServiceFormAction, {});
  const set = (i: number, patch: Partial<ServiceQuestion>) => setQuestions((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, by: number) =>
    setQuestions((list) => {
      const next = list.slice();
      const [q] = next.splice(i, 1);
      next.splice(i + by, 0, q);
      return next;
    });

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="key" value={initial.key} />
        <input type="hidden" name="questions" value={JSON.stringify(questions)} />

        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor="sf-label">Name</Label>
              <Input id="sf-label" name="label" required maxLength={80} defaultValue={initial.label} placeholder="Falls prevention audit" />
            </div>
            {isNew && (
              <fieldset className="space-y-1 sm:col-span-3">
                <legend className="text-sm font-medium">What it covers</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="scope" value="client" defaultChecked={initial.scope === "client"} /> One client at a time — due
                  client by client
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="scope" value="service" defaultChecked={initial.scope === "service"} /> The whole service
                </label>
              </fieldset>
            )}
            <div className="space-y-1">
              <Label htmlFor="sf-every">Falls due every</Label>
              <Input id="sf-every" name="dueEvery" type="number" min={1} max={104} required defaultValue={initial.due.every} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sf-unit">&nbsp;</Label>
              <select id="sf-unit" name="dueUnit" className={selectClass} defaultValue={initial.due.unit}>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
            </div>
            {!isNew && (
              <p className="self-end text-xs text-muted-foreground sm:pb-2">
                {initial.scope === "client" ? "One for each client." : "One for the whole service."}
              </p>
            )}
          </CardContent>
        </Card>

        <section className="space-y-2">
          <div>
            <h2 className="text-base font-semibold">Questions</h2>
            <p className="text-xs text-muted-foreground">
              Yes / No / N/A and ratings make the score; anything answered No, or rated 2 or under, can be given an owner and a date.
            </p>
          </div>
          <Card>
            <CardContent className="divide-y p-0">
              {questions.map((q, i) => (
                <div key={q.id} className="flex gap-2 px-4 py-3">
                  <div className="flex-1 space-y-2">
                    <Input aria-label={`Question ${i + 1}`} value={q.label} maxLength={200} onChange={(e) => set(i, { label: e.target.value })} placeholder="The question" />
                    <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
                      <select
                        aria-label={`Type of question ${i + 1}`}
                        className={selectClass}
                        value={q.type}
                        onChange={(e) => set(i, { type: e.target.value as QuestionType })}
                      >
                        {QUESTION_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label={`Prompt for question ${i + 1}`}
                        value={q.help ?? ""}
                        maxLength={300}
                        onChange={(e) => set(i, { help: e.target.value })}
                        placeholder="A prompt under it (optional)"
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button type="button" variant="ghost" size="sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" aria-label="Move down" disabled={i === questions.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Remove question ${i + 1}`} onClick={() => setQuestions((l) => l.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Button type="button" variant="outline" size="sm" onClick={() => setQuestions((l) => [...l, { id: newId(), label: "", type: "yes_no" }])}>
            <Plus className="size-4" /> Add a question
          </Button>
        </section>

        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Add the audit" : "Save"}
        </Button>
      </form>

      {!isNew && (changed || !ours) && (
        <form
          action={resetAction}
          onSubmit={(e) => {
            const msg = ours ? "Go back to our default questions and due period?" : "Remove this audit? Audits already done stay on record.";
            if (!confirm(msg)) e.preventDefault();
          }}
          className="border-t pt-4"
        >
          <input type="hidden" name="key" value={initial.key} />
          <Button type="submit" variant="ghost" disabled={resetting}>
            {ours ? "Go back to our default" : "Remove this audit"}
          </Button>
          {resetState.error && <p className="text-sm text-rose-600">{resetState.error}</p>}
        </form>
      )}
    </div>
  );
}

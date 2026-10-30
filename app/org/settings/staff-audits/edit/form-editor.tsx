"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuditQuestion, Interval } from "@/lib/audit-forms";
import type { SaveState } from "@/app/platform/actions";
import { resetAuditFormAction, saveAuditFormAction } from "../actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/** A short id for a new question; answers are keyed by it, so it never changes. */
const newId = () => `q_${Math.random().toString(36).slice(2, 10)}`;

export interface EditorForm {
  kind: "supervision" | "appraisal" | "spot_check" | "competency";
  areaKey: string;
  label: string;
  questions: AuditQuestion[];
  selfAssessment: AuditQuestion[];
  due: Interval;
}

/**
 * One form's questions and due period. Questions are reworded, added,
 * removed and reordered here; a question keeps its id when reworded, so
 * records already made still read the same.
 */
export function FormEditor({
  initial,
  isNew,
  changed,
  ours,
}: {
  initial: EditorForm;
  isNew: boolean;
  /** The company has its own version saved. */
  changed: boolean;
  /** One of our forms, so there is a default to go back to. */
  ours: boolean;
}) {
  const [questions, setQuestions] = useState<AuditQuestion[]>(initial.questions.length ? initial.questions : [{ id: newId(), label: "" }]);
  const [selfAssessment, setSelfAssessment] = useState<AuditQuestion[]>(initial.selfAssessment);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveAuditFormAction, {});
  const [resetState, resetAction, resetting] = useActionState<SaveState, FormData>(resetAuditFormAction, {});
  const checklist = initial.kind === "spot_check" || initial.kind === "competency";
  const noun = checklist ? (initial.kind === "competency" ? "criterion" : "item") : "question";

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="kind" value={initial.kind} />
        <input type="hidden" name="areaKey" value={initial.areaKey} />
        <input type="hidden" name="questions" value={JSON.stringify(questions)} />
        <input type="hidden" name="selfAssessment" value={JSON.stringify(selfAssessment)} />

        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
            {initial.kind === "competency" && (
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor="fe-label">Skill</Label>
                <Input id="fe-label" name="label" required maxLength={80} defaultValue={initial.label} placeholder="Catheter care" />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="fe-every">Falls due every</Label>
              <Input id="fe-every" name="dueEvery" type="number" min={1} max={104} required defaultValue={initial.due.every} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fe-unit">&nbsp;</Label>
              <select id="fe-unit" name="dueUnit" className={selectClass} defaultValue={initial.due.unit}>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <QuestionList
          title={checklist ? (initial.kind === "competency" ? "Criteria" : "What is checked") : "Questions"}
          hint={
            checklist
              ? "Each is answered Yes, No or N/A, with a comment. A No needs one."
              : "Each is answered in the assessor's own words."
          }
          noun={noun}
          list={questions}
          onChange={setQuestions}
        />

        {initial.kind === "appraisal" && (
          <QuestionList
            title="The self-assessment"
            hint="What the person fills in on their own login before the appraisal. Leave it empty for none."
            noun="question"
            list={selfAssessment}
            onChange={setSelfAssessment}
          />
        )}

        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Add the skill" : "Save"}
        </Button>
      </form>

      {!isNew && changed && (
        <form
          action={resetAction}
          onSubmit={(e) => {
            const msg = ours ? "Go back to our default questions and due period?" : "Remove this skill? Assessments already made stay on carers' files.";
            if (!confirm(msg)) e.preventDefault();
          }}
          className="border-t pt-4"
        >
          <input type="hidden" name="kind" value={initial.kind} />
          <input type="hidden" name="areaKey" value={initial.areaKey} />
          <Button type="submit" variant="ghost" disabled={resetting}>
            {ours ? "Go back to our default" : "Remove this skill"}
          </Button>
          {resetState.error && <p className="text-sm text-rose-600">{resetState.error}</p>}
        </form>
      )}
    </div>
  );
}

function QuestionList({
  title,
  hint,
  noun,
  list,
  onChange,
}: {
  title: string;
  hint: string;
  noun: string;
  list: AuditQuestion[];
  onChange: (next: AuditQuestion[]) => void;
}) {
  const set = (i: number, patch: Partial<AuditQuestion>) => onChange(list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, by: number) => {
    const next = list.slice();
    const [q] = next.splice(i, 1);
    next.splice(i + by, 0, q);
    onChange(next);
  };
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {list.map((q, i) => (
            <div key={q.id} className="flex gap-2 px-4 py-3">
              <div className="flex-1 space-y-2">
                <Input aria-label={`${noun} ${i + 1}`} value={q.label} maxLength={200} onChange={(e) => set(i, { label: e.target.value })} placeholder={`The ${noun}`} />
                <Input
                  aria-label={`Prompt for ${noun} ${i + 1}`}
                  value={q.help ?? ""}
                  maxLength={300}
                  onChange={(e) => set(i, { help: e.target.value })}
                  placeholder="A prompt under it (optional)"
                  className="text-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Button type="button" variant="ghost" size="sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => onChange(list.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {list.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">None.</p>}
        </CardContent>
      </Card>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, { id: newId(), label: "" }])}>
        <Plus className="size-4" /> Add a {noun}
      </Button>
    </section>
  );
}

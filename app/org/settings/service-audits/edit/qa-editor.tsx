"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QUESTION_TYPES, type ServiceQuestion } from "@/lib/service-audits";
import { QA_HEADINGS, type QaForm } from "@/lib/client-qa";
import type { SaveState } from "@/app/platform/actions";
import { resetServiceFormAction, saveQaFormAction } from "../actions";
import { QuestionList, selectClass } from "./form-editor";

// No photos in a QA: it is a conversation, often by phone.
const QA_TYPES = QUESTION_TYPES.filter((t) => t.value !== "photo");

/**
 * The client QA: how often it falls due, the medication questions (asked
 * only for a client the company helps with medicines) and the company's own
 * questions. The five CQC headings and the rest of the form stay as they are.
 */
export function QaFormEditor({ initial, changed }: { initial: QaForm; changed: boolean }) {
  const [medication, setMedication] = useState<ServiceQuestion[]>(initial.medication);
  const [own, setOwn] = useState<ServiceQuestion[]>(initial.own);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveQaFormAction, {});
  const [resetState, resetAction, resetting] = useActionState<SaveState, FormData>(resetServiceFormAction, {});
  const questions = [...medication.map((q) => ({ ...q, section: "medication" })), ...own.map((q) => ({ ...q, section: "own" }))];

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="questions" value={JSON.stringify(questions)} />
        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="qa-every">Falls due every</Label>
              <Input id="qa-every" name="dueEvery" type="number" min={1} max={104} required defaultValue={initial.due.every} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qa-unit">&nbsp;</Label>
              <select id="qa-unit" name="dueUnit" className={selectClass} defaultValue={initial.due.unit}>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              Every QA asks how it was done and who with, a rating of 1–10 under {QA_HEADINGS.map((h) => h.label).join(", ")}, what we do well,
              what we could do better and an action plan. Those stay as they are.
            </p>
          </CardContent>
        </Card>

        <QuestionList
          title="Medication questions"
          hint="Asked only for clients you help with their medicines."
          list={medication}
          onChange={setMedication}
          types={QA_TYPES}
        />
        <QuestionList title="Your own questions" hint="Asked in every QA, after the ratings." list={own} onChange={setOwn} types={QA_TYPES} />

        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>

      {changed && (
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!confirm("Go back to our default questions and due period?")) e.preventDefault();
          }}
          className="border-t pt-4"
        >
          <input type="hidden" name="key" value="client_qa" />
          <Button type="submit" variant="ghost" disabled={resetting}>
            Go back to our default
          </Button>
          {resetState.error && <p className="text-sm text-rose-600">{resetState.error}</p>}
        </form>
      )}
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_QUESTIONS, type SurveyQuestion } from "@/lib/feedback";
import type { SaveState } from "@/app/platform/actions";
import { saveSurveyQuestionsAction } from "./actions";

const selectClass = "flex h-9 rounded-lg border border-input bg-background px-3 text-sm";

/** One survey's questions: the wording, 1–5 rating or written answer, the order. */
export function QuestionsEditor({ kind, initial }: { kind: string; initial: SurveyQuestion[] }) {
  const [questions, setQuestions] = useState(initial);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveSurveyQuestionsAction, {});
  const update = (i: number, patch: Partial<SurveyQuestion>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + d;
      if (j < 0 || j >= qs.length) return qs;
      const n = [...qs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="questions" value={JSON.stringify(questions)} />
      {questions.map((q, i) => (
        <div key={q.id} className="flex flex-wrap items-center gap-2">
          <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
          <Input value={q.text} onChange={(e) => update(i, { text: e.target.value })} aria-label={`Question ${i + 1}`} className="min-w-64 flex-1" />
          <select value={q.type} onChange={(e) => update(i, { type: e.target.value as SurveyQuestion["type"] })} className={selectClass} aria-label={`Question ${i + 1} answer`}>
            <option value="rating">1–5 rating</option>
            <option value="text">Written answer</option>
          </select>
          <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="size-4" /></Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="size-4" /></Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} aria-label="Remove question"><Trash2 className="size-4" /></Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={questions.length >= MAX_QUESTIONS}
          onClick={() => setQuestions((qs) => [...qs, { id: `q${Date.now().toString(36)}`, text: "", type: "rating" }])}
        >
          <Plus className="size-4" /> Add a question
        </Button>
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {state.ok && <span className="text-sm text-teal-700">Saved — the next round you start will use these.</span>}
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}

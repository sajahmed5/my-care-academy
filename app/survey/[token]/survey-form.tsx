"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { SurveyQuestion } from "@/lib/feedback";
import { submitSurveyAction, type SurveySubmitState } from "./actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const SCALE = [
  { v: 1, label: "Very poor" },
  { v: 2, label: "Poor" },
  { v: 3, label: "OK" },
  { v: 4, label: "Good" },
  { v: 5, label: "Very good" },
];

export function SurveyForm({ token, questions, named = false }: { token: string; questions: SurveyQuestion[]; named?: boolean }) {
  const [state, action, pending] = useActionState<SurveySubmitState, FormData>(submitSurveyAction, {});
  if (state.ok) {
    return <p className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-900">Thank you — your answers have been sent.</p>;
  }
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      {/* A field people never see: anything typed here came from a bot. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {questions.map((q, i) => (
        <fieldset key={q.id} className="space-y-2">
          <legend className="text-sm font-medium">
            {i + 1}. {q.text}
          </legend>
          {q.type === "rating" ? (
            <div className="flex flex-wrap gap-2">
              {SCALE.map((s) => (
                <label key={s.v} className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background">
                  <input type="radio" name={q.id} value={s.v} className="sr-only" />
                  {s.label}
                </label>
              ))}
            </div>
          ) : (
            <textarea name={q.id} rows={3} maxLength={2000} className={textareaClass} />
          )}
        </fieldset>
      ))}
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send"}</Button>
      <p className="text-xs text-muted-foreground">
        {named
          ? "Your answers go to the care provider with your name, so they can follow up anything you raise."
          : "Your answers are anonymous: your name is not asked for or kept."}
      </p>
    </form>
  );
}

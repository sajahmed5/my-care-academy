"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { SelfAssessment } from "@/lib/supervisions";
import type { SaveState } from "@/app/platform/actions";
import { saveSelfAssessmentAction } from "./actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** The short self-assessment before an appraisal. Saved as they go; sent once. */
export function SelfAssessmentForm({ sa }: { sa: SelfAssessment }) {
  const [answers, setAnswers] = useState<Record<string, string>>(sa.answers);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveSelfAssessmentAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={sa.id} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      {sa.questions.map((q) => (
        <div key={q.id} className="space-y-1">
          <Label htmlFor={`sa-${q.id}`}>{q.label}</Label>
          <textarea
            id={`sa-${q.id}`}
            rows={3}
            maxLength={5000}
            className={textareaClass}
            value={answers[q.id] ?? ""}
            onChange={(e) => setAnswers((cur) => ({ ...cur, [q.id]: e.target.value }))}
          />
        </div>
      ))}
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && !state.error && <p className="text-sm text-teal-700">Saved.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="send" value="1" disabled={pending}>
          {sa.submitted_at ? "Send the changes" : "Send to my manager"}
        </Button>
        {!sa.submitted_at && (
          <Button type="submit" variant="outline" disabled={pending}>
            Save for later
          </Button>
        )}
      </div>
    </form>
  );
}

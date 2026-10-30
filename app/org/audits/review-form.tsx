"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/app/platform/actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * A manager's review of a result below the company's level: what they found
 * and what happens next. Used by audits and client QAs alike.
 */
export function ReviewForm({ id, action }: { id: string; action: (prev: SaveState, fd: FormData) => Promise<SaveState> }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`review-${id}`} className="text-sm font-medium">
        Your review
      </label>
      <textarea
        id={`review-${id}`}
        name="note"
        rows={3}
        required
        maxLength={3000}
        className={textareaClass}
        placeholder="What you looked at, what you found, and what happens next."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Mark as reviewed"}
        </Button>
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Heart, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/app/platform/actions";
import { qaComplimentAction, qaConcernAction } from "../actions";

/** The praise to the compliments log, with the carers it is about ticked first. */
export function ComplimentButton({ id, carers }: { id: string; carers: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(qaComplimentAction, {});
  const [open, setOpen] = useState(false);
  if (state.ok) return <p className="text-sm text-green-700">Added to the compliments log.</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {open && carers.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">Who is it about? (optional)</legend>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {carers.map((c) => (
              <label key={c.id} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" name="people" value={c.id} /> {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!open && carers.length > 0 ? (
          // Its own key, and no default: React swaps this for the submit button
          // before the click finishes, which would otherwise send the form.
          <Button
            key="open"
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
          >
            <Heart className="size-4" /> Log as a compliment
          </Button>
        ) : (
          <Button key="send" type="submit" variant="outline" size="sm" disabled={pending}>
            <Heart className="size-4" /> {pending ? "Logging…" : open ? "Log it" : "Log as a compliment"}
          </Button>
        )}
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}

/** The problem raised as a concern waiting for triage; it opens once raised. */
export function ConcernButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(qaConcernAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <MessageSquareWarning className="size-4" /> {pending ? "Raising…" : "Raise as a concern"}
      </Button>
      {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
    </form>
  );
}

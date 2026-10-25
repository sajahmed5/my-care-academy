"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/app/platform/actions";

/** Delete one record past retention, after saying plainly what goes. */
export function RetentionDelete({
  id,
  label,
  action,
}: {
  id: string;
  label: string;
  action: (prev: SaveState, fd: FormData) => Promise<SaveState>;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Permanently delete ${label}? It has passed 7-year retention. This cannot be undone.`)) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
    </form>
  );
}

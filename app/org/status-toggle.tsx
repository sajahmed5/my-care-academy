"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/app/platform/actions";
import { setStaffStatusAction } from "./actions";

export function StatusToggle({
  userId,
  status,
  name,
}: {
  userId: string;
  status: string;
  /** Used in the confirmation, so it never says "are you sure" about nobody. */
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    setStaffStatusAction,
    {} as SaveState,
  );
  const deactivating = status === "active";
  const [done, setDone] = useState<string | null>(null);

  // Locking someone out of their training is worth a question first — the
  // Delete button beside this one always asked, and this one never did.
  function onSubmit(e: React.FormEvent) {
    const message = deactivating
      ? `Deactivate ${name}? They won't be able to sign in or finish their training until you reactivate them.`
      : `Reactivate ${name}? They'll be able to sign in and carry on their training.`;
    if (!window.confirm(message)) {
      e.preventDefault();
      return;
    }
    setDone(deactivating ? `${name} deactivated` : `${name} reactivated`);
  }

  // Clear the note once the page has caught up with the change.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <form action={formAction} onSubmit={onSubmit} className="inline-flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        type="hidden"
        name="status"
        value={deactivating ? "deactivated" : "active"}
      />
      <Button
        type="submit"
        size="xs"
        variant={deactivating ? "ghost" : "outline"}
        disabled={pending}
        // Deactivating is a pause, not a deletion: muted until hovered, like
        // Delete beside it, so a page of staff isn't a column of red.
        className={`min-h-11 sm:min-h-0${deactivating ? " text-muted-foreground hover:bg-amber-50 hover:text-amber-800" : ""}`}
      >
        {pending ? "…" : deactivating ? "Deactivate" : "Reactivate"}
      </Button>
      {state.error ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : done && !pending ? (
        <span className="text-xs text-muted-foreground">{done} ✓</span>
      ) : null}
    </form>
  );
}

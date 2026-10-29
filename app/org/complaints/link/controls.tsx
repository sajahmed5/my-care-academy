"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/app/platform/actions";
import { makeConcernLinkAction, setConcernLinkOpenAction } from "./actions";

export function MakeLink({ again }: { again: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(() => makeConcernLinkAction(), {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (again && !window.confirm("Make a new link? The old one stops working straight away.")) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <Button type="submit" size="sm" variant={again ? "ghost" : "default"} disabled={pending}>
        {pending ? "Making…" : again ? "Make a new link" : "Make the link"}
      </Button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

export function LinkOpenToggle({ open }: { open: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setConcernLinkOpenAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="open" value={open ? "0" : "1"} />
      <Button type="submit" size="sm" variant={open ? "outline" : "default"} disabled={pending}>
        {open ? "Stop taking concerns" : "Open it again"}
      </Button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

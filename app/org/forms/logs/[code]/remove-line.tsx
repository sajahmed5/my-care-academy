"use client";

import { useActionState } from "react";
import type { SaveState } from "@/app/platform/actions";
import { deleteLogLineAction } from "../actions";

/** Take back a line typed by mistake: shown on your own lines, on the day. */
export function RemoveLine({ entryId, code }: { entryId: string; code: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(deleteLogLineAction, {});
  return (
    <form action={action} className="inline">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="code" value={code} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-muted-foreground hover:text-rose-600 hover:underline"
        onClick={(e) => {
          if (!confirm("Remove this line? Do this only for a line added by mistake.")) e.preventDefault();
        }}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {state.error && <span className="ml-2 text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/app/platform/actions";
import { adoptPolicyAction } from "../actions";

/** Start the organisation's own copy of this template. */
export function AdoptButton({ code }: { code: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(adoptPolicyAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="code" value={code} />
      <Button type="submit" disabled={pending}>{pending ? "Starting…" : "Adopt and complete"}</Button>
      {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveAiSettingsAction } from "./ai-actions";

export function AiSettingsForm({ enabled, limitGbp }: { enabled: boolean; limitGbp: number | null }) {
  const [state, action, pending] = useActionState(saveAiSettingsAction, {});
  return (
    <form action={action} className="space-y-4">
      <label className="flex gap-3 rounded-xl border p-4">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="block font-medium">Use AI drafting</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Lets your office draft parts of letters with AI, such as &ldquo;why we chose you&rdquo; on an offer. A person always reads and
            sends what it writes.
          </span>
        </span>
      </label>
      <label className="block max-w-xs text-sm">
        <span className="font-medium">Monthly limit (£)</span>
        <input
          name="limit"
          inputMode="decimal"
          defaultValue={limitGbp ?? ""}
          placeholder="No limit"
          className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <span className="mt-1 block text-xs text-muted-foreground">AI stops for the rest of the month once you reach it.</span>
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {state.ok && <p role="status" className="text-sm text-primary">Saved.</p>}
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  );
}

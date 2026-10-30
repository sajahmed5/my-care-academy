"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SaveState } from "@/app/platform/actions";
import { saveReviewLevelAction, setServiceFormArchivedAction } from "./actions";

/** Stop doing one of the audits, or start again. */
export function AuditSwitch({ formKey, archived }: { formKey: string; archived: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setServiceFormArchivedAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!archived && !confirm("Stop doing this audit? Audits already done stay on record.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="key" value={formKey} />
      <input type="hidden" name="archived" value={archived ? "0" : "1"} />
      <button type="submit" disabled={pending} className="text-sm text-muted-foreground hover:underline">
        {archived ? "Start again" : "Stop"}
      </button>
      {state.error && <span className="ml-2 text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

/** The score below which an audit or QA waits for a manager. */
export function ReviewLevel({ value }: { value: number }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveReviewLevelAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="sa-review">Review anything scoring below</Label>
        <div className="flex items-center gap-2">
          <Input id="sa-review" name="reviewBelow" type="number" min={0} max={100} defaultValue={value} className="w-24" required />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.ok && <span className="text-sm text-green-700">Saved.</span>}
      {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
    </form>
  );
}

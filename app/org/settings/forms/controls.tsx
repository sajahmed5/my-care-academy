"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SaveState } from "@/app/platform/actions";
import { createOwnFormAction, setReviewMonthsAction } from "./actions";

const selectClass = "flex h-9 rounded-lg border border-input bg-background px-3 text-sm";

/** This company's review period for one of our forms; blank uses ours. */
export function ReviewPeriod({ templateId, value, ours }: { templateId: string; value: number | null; ours: number | null }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setReviewMonthsAction, {});
  return (
    <form action={action} className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <input type="hidden" name="templateId" value={templateId} />
      <label htmlFor={`rm-${templateId}`}>Review every</label>
      <Input
        id={`rm-${templateId}`}
        name="reviewMonths"
        type="number"
        min={1}
        max={60}
        defaultValue={value ?? ""}
        placeholder={ours ? String(ours) : "never"}
        className="h-7 w-16 text-xs"
      />
      <span>months</span>
      <Button type="submit" size="xs" variant="outline" disabled={pending}>
        {pending ? "…" : "Save"}
      </Button>
      {state.ok && <span className="text-teal-700">Saved</span>}
      {state.error && <span className="text-rose-600">{state.error}</span>}
    </form>
  );
}

/** Start a form of your own: a name and what kind it is. */
export function NewOwnForm() {
  const [state, action, pending] = useActionState<SaveState, FormData>(createOwnFormAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label htmlFor="own-title" className="text-sm font-medium">Name</label>
        <Input id="own-title" name="title" required maxLength={120} className="w-64" placeholder="Night check sheet" />
      </div>
      <div className="space-y-1">
        <label htmlFor="own-kind" className="text-sm font-medium">What kind</label>
        <select id="own-kind" name="audience" className={selectClass} defaultValue="client">
          <option value="client">Client form — about a client</option>
          <option value="carer">Carer form — asked of staff</option>
          <option value="company">Company form — about the business</option>
          <option value="log">Log — a line added each time</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Starting…" : "Start building"}</Button>
      {state.error && <p className="w-full text-sm text-rose-600">{state.error}</p>}
    </form>
  );
}

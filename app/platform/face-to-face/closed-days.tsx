"use client";

import { useActionState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SaveState } from "@/app/platform/actions";
import { addClosedDayAction, removeClosedDayAction } from "./actions";

/**
 * Days nothing runs: bank holidays, the trainer away, the office shut. No
 * session can be set up — and so nothing booked — on one.
 */
export function ClosedDays({ days }: { days: { day: string; label: string; reason: string | null }[] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(addClosedDayAction, {});
  const [removing, startRemove] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">No closed days coming up.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {days.map((d) => (
            <li key={d.day} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{d.label}</span>
                {d.reason && <span className="text-muted-foreground"> — {d.reason}</span>}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={removing}
                onClick={() =>
                  startRemove(async () => {
                    const r = await removeClosedDayAction(d.day);
                    if (r.error) window.alert(r.error);
                  })
                }
              >
                <X className="size-4" />
                Open it again
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="cd-day">Day</Label>
          <Input id="cd-day" name="day" type="date" required min={today} className="w-44" />
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="cd-reason">Why (optional)</Label>
          <Input id="cd-reason" name="reason" maxLength={200} placeholder="e.g. Bank holiday" />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Mark closed"}
        </Button>
      </form>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
    </div>
  );
}

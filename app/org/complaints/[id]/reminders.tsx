"use client";

import { useActionState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Reminder } from "@/lib/complaints/reminders";
import { confirmReminderAction } from "../actions";
import type { SaveState } from "@/app/platform/actions";

/**
 * The legal reminders, at the top of a safeguarding concern or an accident
 * from the moment it is triaged. Each one is confirmed by a person; the site
 * files nothing itself.
 */
export function Reminders({ complaintId, reminders, disabled }: { complaintId: string; reminders: Reminder[]; disabled: boolean }) {
  if (reminders.length === 0) return null;
  const open = reminders.filter((r) => !r.done).length;
  return (
    <Card className={open ? "border-amber-300" : ""}>
      <CardContent className="space-y-3 pt-6">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className={`size-4 ${open ? "text-amber-600" : "text-muted-foreground"}`} />
            What the law asks of you
          </p>
          <p className="text-xs text-muted-foreground">
            This site does not send or file any of these. Do each one yourself, then confirm it here — or record the decision on its stage.
          </p>
        </div>
        <ul className="space-y-2">
          {reminders.map((r) => (
            <ReminderRow key={r.key} complaintId={complaintId} reminder={r} disabled={disabled} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ReminderRow({ complaintId, reminder: r, disabled }: { complaintId: string; reminder: Reminder; disabled: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(confirmReminderAction, {});
  const confirmed = !!r.done?.how.startsWith("Confirmed");
  return (
    <li className={`rounded-lg border p-3 text-sm ${r.done ? "bg-muted/30" : r.likely ? "border-amber-300 bg-amber-50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-medium">
            {r.done && <Check className="size-4 text-green-700" />}
            {r.title}
          </p>
          {!r.done && <p className="mt-1 text-muted-foreground">{r.body}</p>}
          {r.done && <p className="text-xs text-green-800">{r.done.how}</p>}
        </div>
        {!disabled && (!r.done || confirmed) && (
          <form action={action}>
            <input type="hidden" name="complaintId" value={complaintId} />
            <input type="hidden" name="key" value={r.key} />
            {confirmed && <input type="hidden" name="undo" value="1" />}
            <Button type="submit" size="sm" variant={confirmed ? "ghost" : "outline"} disabled={pending}>
              {confirmed ? "Undo" : "I've done this"}
            </Button>
          </form>
        )}
      </div>
      {state.error && <p className="mt-1 text-xs text-rose-600">{state.error}</p>}
    </li>
  );
}

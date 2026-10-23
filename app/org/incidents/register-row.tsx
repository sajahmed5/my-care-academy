"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  INCIDENT_STATUSES,
  categoryLabel,
  kindLabel,
  statusLabel,
  type Incident,
} from "@/lib/incidents";
import { setIncidentStatusAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-rose-100 text-rose-700",
  investigating: "bg-amber-100 text-amber-700",
  closed: "bg-green-100 text-green-700",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One row of the register, with the only thing it can be asked to do: move
 * along. Closing wants what came of it, because a complaint closed with no
 * outcome recorded is the thing an inspector asks about.
 */
export function RegisterRow({ incident }: { incident: Incident }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    setIncidentStatusAction,
    {},
  );

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            {kindLabel(incident.kind)} · {categoryLabel(incident.category)} ·{" "}
            {fmtDate(incident.occurred_on)}
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                STATUS_STYLE[incident.status] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {statusLabel(incident.status)}
            </span>
            {!open && (
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                Update
              </Button>
            )}
          </div>
        </div>

        <p className="whitespace-pre-line text-sm text-muted-foreground">
          {incident.summary}
        </p>

        {incident.people.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Named:{" "}
            {incident.people
              .map((p) => p.name ?? "someone no longer on the system")
              .join(", ")}
          </p>
        )}

        {incident.outcome && (
          <p className="rounded-lg bg-muted/40 p-3 text-sm">
            <span className="font-medium">Outcome:</span> {incident.outcome}
            {incident.closed_on && (
              <span className="text-muted-foreground">
                {" "}
                · closed {fmtDate(incident.closed_on)}
              </span>
            )}
          </p>
        )}

        {open && (
          <form action={formAction} className="space-y-2 rounded-lg bg-muted/30 p-3">
            <input type="hidden" name="incidentId" value={incident.id} />
            <div className="space-y-1">
              <Label htmlFor={`status-${incident.id}`}>Status</Label>
              <select
                id={`status-${incident.id}`}
                name="status"
                className={selectClass}
                defaultValue={incident.status}
              >
                {INCIDENT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`outcome-${incident.id}`}>What came of it</Label>
              <textarea
                id={`outcome-${incident.id}`}
                name="outcome"
                rows={3}
                maxLength={5000}
                className={textareaClass}
                defaultValue={incident.outcome ?? ""}
                placeholder="What was found, what was done, and what was said to whoever raised it."
              />
            </div>
            {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

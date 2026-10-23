"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INCIDENT_CATEGORIES, INCIDENT_KINDS } from "@/lib/incidents";
import { addIncidentAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record a complaint, accident, near miss or safeguarding concern.
 *
 * Shared by the register and by a carer's file, where `userId` tags that
 * person as involved — the commonest way one gets recorded, because the
 * manager is already looking at the person it concerns.
 */
export function RecordIncident({ userId }: { userId?: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    addIncidentAction,
    {},
  );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Record one
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          {userId && <input type="hidden" name="userId" value={userId} />}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="in-kind">Type</Label>
              <select id="in-kind" name="kind" className={selectClass} defaultValue="complaint">
                {INCIDENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="in-category">What it was about</Label>
              <select id="in-category" name="category" className={selectClass} defaultValue="medication">
                {INCIDENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="in-date">When</Label>
              <Input id="in-date" name="occurredOn" type="date" required defaultValue={todayISO()} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="in-summary">What happened</Label>
            <textarea
              id="in-summary"
              name="summary"
              rows={3}
              required
              maxLength={5000}
              className={textareaClass}
              placeholder="What was reported, and by whom."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {userId
              ? "This person is tagged as involved. "
              : "Tag the people involved from their own file. "}
            It opens as Open — close it from the register, with what came of it.
          </p>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          {state.ok && !state.error && (
            <p className="text-sm text-teal-700">Recorded.</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save record"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

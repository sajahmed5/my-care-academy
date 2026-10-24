"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPLAINT_KINDS, RAISED_BY_ROLES } from "@/lib/complaints/stages";
import type { StaffOption } from "@/lib/complaints/data";
import { createComplaintAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";

export const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
export const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Record a complaint, a safeguarding concern or an issue. What is typed here
 * becomes the Complaint Form stage, so the first step is done on arrival
 * rather than asked for twice.
 */
export function NewComplaint({ staff }: { staff: StaffOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(createComplaintAction, {});

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Record one
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="nc-kind">This is</Label>
              <select id="nc-kind" name="kind" className={selectClass} defaultValue="complaint">
                {COMPLAINT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-reported">When it reached us</Label>
              <Input id="nc-reported" name="reportedOn" type="date" required defaultValue={todayISO()} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-occurred">When it happened</Label>
              <Input id="nc-occurred" name="occurredOn" type="date" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="nc-raised">Who raised it</Label>
              <Input id="nc-raised" name="raisedByName" placeholder="Their name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-role">What they are to the service</Label>
              <select id="nc-role" name="raisedByRole" className={selectClass} defaultValue="">
                <option value="">—</option>
                {RAISED_BY_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-about">Who the care was for</Label>
              <Input id="nc-about" name="aboutName" placeholder="The person receiving care" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-desc">What was raised</Label>
            <textarea
              id="nc-desc"
              name="description"
              rows={4}
              required
              maxLength={10000}
              className={textareaClass}
              placeholder="In their own words, as far as possible."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-desired">What they would like to see happen</Label>
            <Input id="nc-desired" name="desiredOutcome" />
          </div>
          {staff.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="nc-staff">Staff it is about</Label>
              <select id="nc-staff" name="staff" multiple className={`${selectClass} h-28`}>
                {staff.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Hold ⌘ or Ctrl to pick more than one. They can be added later too.</p>
            </div>
          )}
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record it"}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

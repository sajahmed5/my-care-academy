"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPLAINT_KINDS, RAISED_BY_ROLES } from "@/lib/complaints/stages";
import { createComplaintAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";

export const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
export const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * The greyed example in the description box. It walks through what a CQC
 * inspector looks for in a complaint record (Regulation 16): what happened,
 * when and where, who was involved, the effect on the person, and what was
 * done straight away — in the complainant's words where possible.
 */
const DESCRIPTION_EXAMPLE = [
  "What happened, in their own words where possible: when and where, who was involved, the effect on the person receiving care, and anything already done about it.",
  "",
  "For example: Mrs A's daughter phoned on 3 March. She said the morning call on 2 March arrived at 9:40 instead of 8:00, and her mother had not had her 8am medication or breakfast until then. She was upset that no one rang to say the carer was late. The on-call coordinator apologised and checked Mrs A was well; no harm was found.",
].join("\n");

/**
 * Record a complaint, a safeguarding concern or an issue. What is typed here
 * becomes the Complaint Form stage, so the first step is done on arrival
 * rather than asked for twice.
 */
export function NewComplaint() {
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
        {/* Labels and rows as Norwood asked (#61): type alone, then the two
            dates, then who raised it and their role, then the service user.
            Staff are named from the record itself, under "Staff named". */}
        <form action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nc-kind">Type</Label>
              <select id="nc-kind" name="kind" className={selectClass} defaultValue="complaint">
                {COMPLAINT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nc-reported">Date raised</Label>
              <Input id="nc-reported" name="reportedOn" type="date" required defaultValue={todayISO()} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-occurred">Date of incident</Label>
              <Input id="nc-occurred" name="occurredOn" type="date" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nc-raised">Raised by</Label>
              <Input id="nc-raised" name="raisedByName" placeholder="Their name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-role">Role</Label>
              <select id="nc-role" name="raisedByRole" className={selectClass} defaultValue="">
                <option value="">—</option>
                {RAISED_BY_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nc-about">Service user</Label>
              <Input id="nc-about" name="aboutName" placeholder="The person receiving care" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-desc">Detailed description</Label>
            <textarea
              id="nc-desc"
              name="description"
              rows={6}
              required
              maxLength={10000}
              className={`${textareaClass} placeholder:text-muted-foreground/70`}
              placeholder={DESCRIPTION_EXAMPLE}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-desired">What they would like to see happen</Label>
            <Input id="nc-desired" name="desiredOutcome" />
          </div>
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

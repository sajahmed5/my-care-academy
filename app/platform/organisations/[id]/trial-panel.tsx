"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PACKAGE_TIERS } from "@/lib/organisations";
import { formatDate } from "@/lib/dates";
import { daysLeftLabel, trialState, ukDateKey } from "@/lib/trial";
import type { SaveState } from "@/app/platform/actions";
import { convertTrialAction, extendTrialAction, startTrialAction } from "./trial-actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

const longDate = { weekday: "long", day: "numeric", month: "long", year: "numeric" } as const;

/** Start, extend or convert a free trial (TRIAL.md). */
export function TrialPanel({ orgId, trialEndsAt }: { orgId: string; trialEndsAt: string | null }) {
  const [startState, start, starting] = useActionState<SaveState, FormData>(startTrialAction, {});
  const [extendState, extend, extending] = useActionState<SaveState, FormData>(extendTrialAction, {});
  const [convertState, convert, converting] = useActionState<SaveState, FormData>(convertTrialAction, {});
  const trial = trialState(trialEndsAt);

  if (trial.kind === "none") {
    return (
      <form action={start} className="space-y-3">
        <input type="hidden" name="orgId" value={orgId} />
        <p className="text-sm text-muted-foreground">
          Gives them everything in Enterprise for 7 days, ending at 11:59pm on the 7th day. Face-to-face booking,
          bespoke report building and AI are held back. When it ends the whole company pauses, and their records are
          kept for 30 days.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="trial-start">Starting</Label>
            <Input id="trial-start" name="start" type="date" defaultValue={ukDateKey(new Date())} className="w-44" />
          </div>
          <Button type="submit" disabled={starting}>
            {starting ? "Starting…" : "Start 7-day trial"}
          </Button>
        </div>
        {startState.error && <p className="text-sm text-rose-600">{startState.error}</p>}
      </form>
    );
  }

  const ends = formatDate(trial.endsAt, longDate);
  return (
    <div className="space-y-4">
      <p className="text-sm">
        {trial.kind === "active" ? (
          <>
            <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              {daysLeftLabel(trial.daysLeft)}
            </span>
            Enterprise, ending at 11:59pm on {ends}. Face-to-face booking, bespoke report building and AI are held
            back until they convert.
          </>
        ) : (
          <>
            <span className="mr-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900">
              Trial ended
            </span>
            Ended on {ends}. The company is paused, and its records are removed on{" "}
            {formatDate(trial.removeAt, longDate)} unless it converts.
          </>
        )}
      </p>

      <form action={extend}>
        <input type="hidden" name="orgId" value={orgId} />
        <Button type="submit" variant="outline" disabled={extending}>
          {extending ? "Extending…" : "Extend 7 days"}
        </Button>
        {extendState.error && <p className="mt-2 text-sm text-rose-600">{extendState.error}</p>}
      </form>

      <form action={convert} className="flex flex-wrap items-end gap-3 border-t pt-4">
        <input type="hidden" name="orgId" value={orgId} />
        <div className="w-48 space-y-1">
          <Label htmlFor="trial-convert">Convert to</Label>
          <select id="trial-convert" name="tier" defaultValue="full" className={selectClass}>
            {[...PACKAGE_TIERS].reverse().map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={converting}>
          {converting ? "Converting…" : "Convert"}
        </Button>
        {convertState.error && <p className="w-full text-sm text-rose-600">{convertState.error}</p>}
      </form>
    </div>
  );
}

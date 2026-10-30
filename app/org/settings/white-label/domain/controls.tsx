"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SaveState } from "@/app/platform/actions";
import { cancelDomainAction, checkDomainAction, requestDomainAction } from "./actions";

/** Ask for an address (or a different one). */
export function RequestDomain({ current }: { current?: string | null }) {
  const [state, ask, asking] = useActionState<SaveState, FormData>(requestDomainAction, {});
  return (
    <form action={ask} className="space-y-2">
      <Label htmlFor="domain">Your address</Label>
      <div className="flex flex-wrap gap-2">
        <Input id="domain" name="domain" defaultValue={current ?? ""} placeholder="training.yourcompany.co.uk" className="w-72" required />
        <Button type="submit" size="sm" disabled={asking}>
          {current ? "Change address" : "Set up this address"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        An address under your company&apos;s own domain works best, like training.yourcompany.co.uk. Your website stays
        exactly as it is.
      </p>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
    </form>
  );
}

/** Check the DNS record now. */
export function CheckDomain() {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await checkDomainAction();
            setNote(
              r.ok
                ? { ok: true, text: "The record is in place." }
                : { ok: false, text: `${r.error ?? "Not yet."}${r.found ? ` We found ${r.found} instead.` : ""} Records can take a few hours to show.` },
            );
          })
        }
      >
        {pending ? "Checking…" : "Check the record now"}
      </Button>
      {note && <span className={`text-sm ${note.ok ? "text-green-700" : "text-amber-700"}`}>{note.text}</span>}
    </div>
  );
}

/** Stop using the address. */
export function CancelDomain({ live }: { live: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        const ask = live
          ? "Stop using your own address? Your staff sign in on My Care Academy's address again, and emails link there."
          : "Cancel this address?";
        if (window.confirm(ask)) start(async () => void (await cancelDomainAction()));
      }}
    >
      {live ? "Stop using it" : "Cancel"}
    </Button>
  );
}

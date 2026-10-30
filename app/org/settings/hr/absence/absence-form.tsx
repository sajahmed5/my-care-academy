"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAbsenceSettingsAction } from "../actions";

export function AbsenceSettingsForm({ selfReport, triggers }: { selfReport: boolean; triggers: number[] }) {
  const [on, setOn] = useState(selfReport);
  const [points, setPoints] = useState(triggers.join(", "));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const card = "space-y-3 rounded-2xl border bg-card p-5";
  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveAbsenceSettingsAction({ selfReport: on, triggers: points.split(/[,\s]+/).map(Number) });
          setMessage(r.ok ? "Saved." : r.error ?? "That didn't save.");
        });
      }}
    >
      <section className={card}>
        <h3 className="font-semibold">Reporting sick</h3>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={on} onChange={(e) => setOn(e.target.checked)} />
          <span>
            Staff can report sick from their own login
            <span className="block text-muted-foreground">
              Off by default: in home care, carers usually ring the on-call line so visits can be covered. When it&apos;s on, managers are emailed when someone reports sick.
            </span>
          </span>
        </label>
      </section>
      <section className={card}>
        <h3 className="font-semibold">Trigger points</h3>
        <Input value={points} onChange={(e) => setPoints(e.target.value)} className="w-60" aria-label="Trigger points" />
        <p className="text-sm text-muted-foreground">
          Bradford Factor scores (spells × spells × days, over 52 weeks), separated by commas. Reaching one flags it to you on the Absence page and in the weekly email; nothing happens on its own. Pregnancy-related absence and injuries at work are never counted.
        </p>
      </section>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Save</Button>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}

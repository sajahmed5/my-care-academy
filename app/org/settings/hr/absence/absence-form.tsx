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
        <p className="text-sm text-muted-foreground">
          Scores that flag someone&apos;s sickness absence to you, so you know when to have a conversation. Separate them with commas; ours are 51, 201 and 401.
        </p>
        <Input value={points} onChange={(e) => setPoints(e.target.value)} className="w-60" aria-label="Trigger points" />
        <BradfordExplainer />
      </section>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Save</Button>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}

/**
 * What the trigger points are and how the score is worked out, with a small
 * calculator (issue #87: "not sure what this is"). The sum is bradford() in
 * lib/hr/absence.ts.
 */
function BradfordExplainer() {
  const [spells, setSpells] = useState("3");
  const [days, setDays] = useState("6");
  const s = Math.max(0, Math.floor(Number(spells) || 0));
  const d = Math.max(0, Math.floor(Number(days) || 0));
  const box = "w-16 rounded-md border bg-background px-2 py-1 text-sm";
  return (
    <details className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">How the score works</summary>
      <div className="mt-3 space-y-3">
        <p>
          It&apos;s the <strong>Bradford Factor</strong>, a common way of spotting frequent short absences, which are harder to cover on a rota than one long one.
          For each person we look back 52 weeks and work out:
        </p>
        <p className="rounded-lg bg-card px-3 py-2 text-center font-medium">spells × spells × days off = score</p>
        <p className="text-muted-foreground">
          A <em>spell</em> is one separate time off sick, however long. <em>Days off</em> is the total across all of them.
        </p>
        <table className="w-full text-left">
          <thead className="text-muted-foreground">
            <tr><th className="py-1 font-normal">In the last 52 weeks</th><th className="py-1 font-normal">Sum</th><th className="py-1 text-right font-normal">Score</th></tr>
          </thead>
          <tbody className="divide-y">
            <tr><td className="py-1.5">One spell of 10 days</td><td>1 × 1 × 10</td><td className="text-right font-medium">10</td></tr>
            <tr><td className="py-1.5">Two spells, 3 days each</td><td>2 × 2 × 6</td><td className="text-right font-medium">24</td></tr>
            <tr><td className="py-1.5">Five single days</td><td>5 × 5 × 5</td><td className="text-right font-medium">125</td></tr>
            <tr><td className="py-1.5">Ten single days</td><td>10 × 10 × 10</td><td className="text-right font-medium">1,000</td></tr>
          </tbody>
        </table>
        <p className="text-muted-foreground">So ten days off in one go scores 10, but ten single days scores 1,000.</p>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2">
          <span>Try it:</span>
          <input type="number" min={0} max={99} value={spells} onChange={(e) => setSpells(e.target.value)} className={box} aria-label="Spells" />
          <span>spells,</span>
          <input type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} className={box} aria-label="Days off" />
          <span>days off =</span>
          <strong>{(s * s * d).toLocaleString("en-GB")}</strong>
        </div>
        <p>
          <strong>Trigger points.</strong> When someone&apos;s score reaches one of yours, we flag it on the Absence page and in the weekly email. Many companies use
          three: around 51 for an informal chat, 201 for a formal meeting, and 401 for a final stage. You decide what each means in your absence policy.
        </p>
        <p>
          <strong>Nothing happens on its own.</strong> It&apos;s a prompt to talk to them, not a decision. Absence related to pregnancy, and injuries at work, are
          never counted. If someone has a disability, think about reasonable adjustments before you act on a score.
        </p>
      </div>
    </details>
  );
}

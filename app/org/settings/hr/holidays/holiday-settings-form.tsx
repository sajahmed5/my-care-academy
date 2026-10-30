"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/hr/fields";
import type { HolidaySettings, LeaveType } from "@/lib/hr/holidays";
import { saveHolidaySettingsAction } from "../actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const newKey = () => `own_${Math.random().toString(36).slice(2, 10)}`;

export function HolidaySettingsForm({ initial, ours }: { initial: HolidaySettings; ours: Array<{ label: string; fromAllowance: boolean }> }) {
  const [month, setMonth] = useState(initial.yearStart.slice(0, 2));
  const [day, setDay] = useState(String(Number(initial.yearStart.slice(3))));
  const [bank, setBank] = useState(initial.bankHolidaysFromAllowance);
  const [max, setMax] = useState(initial.maxOffAtOnce === null ? "" : String(initial.maxOffAtOnce));
  const [own, setOwn] = useState<LeaveType[]>(initial.own);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const card = "space-y-3 rounded-2xl border bg-card p-5";
  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveHolidaySettingsAction({
            yearStart: `${month}-${String(Number(day)).padStart(2, "0")}`,
            bankHolidaysFromAllowance: bank,
            maxOffAtOnce: max.trim() ? Number(max) : null,
            own: own.filter((t) => t.label.trim()),
          });
          setMessage(r.ok ? "Saved." : r.error ?? "That didn't save.");
        });
      }}
    >
      <section className={card}>
        <h3 className="font-semibold">Your leave year</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          Starts on
          <Input type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} className="w-20" aria-label="Day" />
          <select className={`${selectClass} w-40`} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
            ))}
          </select>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={bank} onChange={(e) => setBank(e.target.checked)} />
          <span>
            Bank holidays come out of the allowance
            <span className="block text-muted-foreground">On: a bank holiday inside someone&apos;s leave counts towards it. Off: it&apos;s left out of the suggested amount.</span>
          </span>
        </label>
      </section>
      <section className={card}>
        <h3 className="font-semibold">How many can be off at once</h3>
        <Input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} placeholder="No limit" className="w-32" aria-label="Most off at once" />
        <p className="text-sm text-muted-foreground">A warning when approving, which the approver can override. Never a block.</p>
      </section>
      <section className={card}>
        <h3 className="font-semibold">Kinds of leave</h3>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {ours.map((t) => (
            <li key={t.label}>{t.label}{t.fromAllowance ? " (from the allowance)" : ""}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Sickness is recorded under Absence, not here. Add your own:</p>
        {own.map((t, i) => (
          <div key={t.key} className="flex flex-wrap items-center gap-2">
            <Input value={t.label} onChange={(e) => setOwn(own.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={60} className="w-64" aria-label="Name" />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={t.fromAllowance} onChange={(e) => setOwn(own.map((x, j) => (j === i ? { ...x, fromAllowance: e.target.checked } : x)))} /> From the allowance
            </label>
            <Button type="button" size="xs" variant="ghost" onClick={() => setOwn(own.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        {own.length < 12 && (
          <Button type="button" size="sm" variant="outline" onClick={() => setOwn([...own, { key: newKey(), label: "", fromAllowance: false }])}>
            Add a kind of leave
          </Button>
        )}
      </section>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Save</Button>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}

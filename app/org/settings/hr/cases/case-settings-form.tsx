"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CaseSettings } from "@/lib/hr/cases";
import { saveCaseSettingsAction } from "../actions";

export function CaseSettingsForm({ initial, office }: { initial: CaseSettings; office: Array<{ id: string; name: string }> }) {
  const [v, setV] = useState({
    warningFirstMonths: String(initial.warningFirstMonths),
    warningFinalMonths: String(initial.warningFinalMonths),
    hearingNoticeDays: String(initial.hearingNoticeDays),
    appealDays: String(initial.appealDays),
    grievanceAckDays: String(initial.grievanceAckDays),
  });
  const [access, setAccess] = useState<string[]>(initial.officeAccess);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const card = "space-y-3 rounded-2xl border bg-card p-5";
  const num = (k: keyof typeof v, label: string, unit: string) => (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-72">{label}</span>
      <Input type="number" min={1} max={36} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="w-20" />
      {unit}
    </label>
  );
  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveCaseSettingsAction({
            warningFirstMonths: Number(v.warningFirstMonths),
            warningFinalMonths: Number(v.warningFinalMonths),
            hearingNoticeDays: Number(v.hearingNoticeDays),
            appealDays: Number(v.appealDays),
            grievanceAckDays: Number(v.grievanceAckDays),
            officeAccess: access,
          });
          setMessage(r.ok ? "Saved." : r.error ?? "That didn't save.");
        });
      }}
    >
      <section className={card}>
        <h3 className="font-semibold">Timescales</h3>
        {num("hearingNoticeDays", "Notice before a hearing or meeting", "days")}
        {num("appealDays", "Time to appeal after an outcome letter", "days")}
        {num("grievanceAckDays", "Acknowledge a grievance within", "days")}
        {num("warningFirstMonths", "A first written warning stays active for", "months")}
        {num("warningFinalMonths", "A final written warning stays active for", "months")}
        <p className="text-sm text-muted-foreground">
          These follow the ACAS Code of Practice. The right to be accompanied and the right to appeal are always in the letters and can&apos;t be taken out.
        </p>
      </section>
      <section className={card}>
        <h3 className="font-semibold">Who sees cases</h3>
        <p className="text-sm text-muted-foreground">
          Managers, always. Tick office workers who should too. Nobody ever sees a case about themselves.
        </p>
        {office.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have no office workers.</p>
        ) : (
          office.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={access.includes(o.id)} onChange={(e) => setAccess(e.target.checked ? [...access, o.id] : access.filter((x) => x !== o.id))} />
              {o.name}
            </label>
          ))
        )}
      </section>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Save</Button>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}

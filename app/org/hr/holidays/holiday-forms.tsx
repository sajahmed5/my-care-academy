"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/hr/fields";
import { suggestDays, type LeaveType } from "@/lib/hr/holidays";
import { addLeaveAction, cancelLeaveAction, decideLeaveAction, setAllowanceAction } from "./actions";

const label = "text-xs font-medium";

export function AllowanceForm({ userId, yearStart, yearLabel, amount, unit }: { userId: string; yearStart: string; yearLabel: string; amount: number | null; unit: string }) {
  const router = useRouter();
  const [a, setA] = useState(amount === null ? "" : String(amount));
  const [u, setU] = useState(unit);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setAllowanceAction(userId, { yearStart, amount: Number(a), unit: u, note: "" });
          setMessage(r.ok ? "Saved." : r.error ?? "That didn't save.");
          if (r.ok) router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <label htmlFor="al-amount" className={label}>Allowance for {yearLabel}</label>
        <Input id="al-amount" type="number" step="0.5" min={0} value={a} onChange={(e) => setA(e.target.value)} className="w-28" />
      </div>
      <select className={`${selectClass} w-28`} value={u} onChange={(e) => setU(e.target.value)} aria-label="Unit">
        <option value="days">days</option>
        <option value="hours">hours</option>
      </select>
      <Button type="submit" size="sm" disabled={pending}>Save</Button>
      {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
    </form>
  );
}

/**
 * Leave: the kind, the dates and how much it takes. The amount is suggested
 * from the weekdays (and the company's bank holiday rule) and can be changed:
 * only the person and the office know the rota.
 */
export function LeaveForm({
  types,
  unit,
  bankHolidaysFromAllowance,
  submit,
  people,
  userId,
  canApproveNow,
  submitLabel,
}: {
  types: LeaveType[];
  unit: string;
  bankHolidaysFromAllowance: boolean;
  submit?: (input: { type: string; start: string; end: string; amount: number; note: string }) => Promise<{ ok: boolean; error?: string }>;
  people?: Array<{ id: string; name: string }>;
  userId?: string;
  canApproveNow?: boolean;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [who, setWho] = useState(userId ?? "");
  const [type, setType] = useState(types[0]?.key ?? "annual");
  const [s, setS] = useState("");
  const [e, setE] = useState("");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState("");
  const [approve, setApprove] = useState(!!canApproveNow);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const suggest = (from: string, to: string) => {
    if (touched || unit === "hours" || !from || !(to || from)) return;
    setAmount(String(suggestDays(from, to && to >= from ? to : from, bankHolidaysFromAllowance)));
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => {
          const input = { type, start: s, end: e || s, amount: Number(amount), note };
          let r: { ok: boolean; error?: string };
          if (submit) r = await submit(input);
          else if (!who) r = { ok: false, error: "Choose who." };
          else r = await addLeaveAction(who, { ...input, approveNow: approve });
          if (!r.ok) return setMessage(r.error ?? "That didn't save.");
          setMessage("Saved.");
          setS("");
          setE("");
          setAmount("");
          setTouched(false);
          setNote("");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap gap-3">
        {people && (
          <div className="space-y-1">
            <label htmlFor="lv-who" className={label}>Who</label>
            <select id="lv-who" className={`${selectClass} w-52`} value={who} onChange={(ev) => setWho(ev.target.value)}>
              <option value="">Choose…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="lv-type" className={label}>Kind of leave</label>
          <select id="lv-type" className={`${selectClass} w-60`} value={type} onChange={(ev) => setType(ev.target.value)}>
            {types.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="lv-start" className={label}>First day</label>
          <Input id="lv-start" type="date" value={s} onChange={(ev) => { setS(ev.target.value); suggest(ev.target.value, e); }} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="lv-end" className={label}>Last day</label>
          <Input id="lv-end" type="date" value={e} min={s || undefined} onChange={(ev) => { setE(ev.target.value); suggest(s, ev.target.value); }} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="lv-amount" className={label}>How many {unit}</label>
          <Input id="lv-amount" type="number" step="0.5" min={0} value={amount} onChange={(ev) => { setTouched(true); setAmount(ev.target.value); }} className="w-28" />
        </div>
      </div>
      <Input value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={500} placeholder="A note (optional)" aria-label="Note" />
      <div className="flex flex-wrap items-center gap-3">
        {canApproveNow !== undefined && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={approve} onChange={(ev) => setApprove(ev.target.checked)} /> Approve it now
          </label>
        )}
        <Button type="submit" size="sm" disabled={pending}>{submitLabel ?? "Add the leave"}</Button>
        {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </form>
  );
}

/** Approve or decline, with the reason; past the limit, a warning to confirm. */
export function DecideLeave({ id }: { id: string }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (d: "approved" | "declined", override = false) =>
    start(async () => {
      const r = await decideLeaveAction(id, d, note, override);
      if (r.overLimit) {
        return setWarning(
          `That would make ${r.overLimit.busiest} off at once; your limit is ${r.overLimit.limit}.${r.overLimit.others.length ? ` Also off: ${r.overLimit.others.join(", ")}.` : ""}`,
        );
      }
      if (!r.ok) return setMessage(r.error ?? "That didn't save.");
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!declining && (
          <Button size="xs" disabled={pending} onClick={() => decide("approved")}>
            Approve
          </Button>
        )}
        {declining ? (
          <>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (it goes in their email)" className="h-8 w-72" maxLength={500} />
            <Button size="xs" variant="destructive" disabled={pending} onClick={() => decide("declined")}>Decline</Button>
            <Button size="xs" variant="ghost" onClick={() => setDeclining(false)}>Cancel</Button>
          </>
        ) : (
          <Button size="xs" variant="outline" disabled={pending} onClick={() => setDeclining(true)}>Decline…</Button>
        )}
        {message && <span role="status" className="text-xs text-destructive">{message}</span>}
      </div>
      {warning && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {warning}
          <Button size="xs" variant="outline" disabled={pending} onClick={() => decide("approved", true)}>Approve anyway</Button>
        </div>
      )}
    </div>
  );
}

export function CancelLeave({ id, label: text = "Cancel" }: { id: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Cancel this leave?")) return;
        start(async () => {
          await cancelLeaveAction(id);
          router.refresh();
        });
      }}
    >
      {text}
    </Button>
  );
}

"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_RECIPIENTS, WEEKDAYS, type Recipient } from "@/lib/bespoke/schedule";
import type { SaveState } from "@/app/platform/actions";
import { deleteScheduleAction, saveScheduleAction, sendNowAction, setManagersOnlyAction, setScheduleActiveAction } from "./actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-2 text-sm";

/** Managers only, or managers and office staff. */
export function ManagersOnly({ reportId, value }: { reportId: string; value: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-primary"
        defaultChecked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          start(async () => {
            const r = await setManagersOnlyAction(reportId, next);
            setError(r.ok ? null : (r.error ?? "Something went wrong."));
          });
        }}
      />
      <span>
        Managers only
        <span className="block text-xs text-muted-foreground">
          Off, office staff see it too. Scheduled emails still go to the people named below.
        </span>
        {error && <span className="block text-xs text-red-700">{error}</span>}
      </span>
    </label>
  );
}

export interface ScheduleDefaults {
  id: string;
  frequency: "weekly" | "monthly";
  weekday: number | null;
  dayOfMonth: number | null;
  format: "pdf" | "xlsx";
  recipients: Recipient[];
}

/** Add or change a schedule: how often, the format, and the people. */
export function ScheduleForm({
  reportId,
  schedule,
  people,
  onDone,
}: {
  reportId: string;
  schedule?: ScheduleDefaults;
  /** The company's managers and office staff, to add with one click. */
  people: Recipient[];
  onDone: () => void;
}) {
  const [frequency, setFrequency] = useState(schedule?.frequency ?? "monthly");
  const [rows, setRows] = useState<Recipient[]>(schedule?.recipients.length ? schedule.recipients : [{ name: "", email: "" }]);
  const [state, action, pending] = useActionState<SaveState, FormData>(async (prev, fd) => {
    const r = await saveScheduleAction(reportId, schedule?.id ?? null, prev, fd);
    if (r.ok) onDone();
    return r;
  }, {});
  const addable = people.filter((p) => !rows.some((r) => r.email.toLowerCase() === p.email.toLowerCase()));
  const set = (i: number, patch: Partial<Recipient>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const id = (k: string) => `${schedule?.id ?? reportId}-${k}`;

  return (
    <form action={action} className="space-y-4 rounded-xl border bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={id("frequency")}>How often</Label>
          <select
            id={id("frequency")}
            name="frequency"
            className={selectClass}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")}
          >
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
          </select>
        </div>
        {frequency === "weekly" ? (
          <div className="space-y-1.5">
            <Label htmlFor={id("weekday")}>On</Label>
            <select id={id("weekday")} name="weekday" className={selectClass} defaultValue={schedule?.weekday ?? 1}>
              {WEEKDAYS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={id("day")}>On day</Label>
            <select id={id("day")} name="dayOfMonth" className={selectClass} defaultValue={schedule?.dayOfMonth ?? 1}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={id("format")}>As</Label>
          <select id={id("format")} name="format" className={selectClass} defaultValue={schedule?.format ?? "pdf"}>
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Sent from 7am on the day, with that day&apos;s data.</p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Send it to</legend>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input name="name" aria-label="Name" placeholder="Name" className="w-auto min-w-40 flex-1" value={r.name} maxLength={120} onChange={(e) => set(i, { name: e.target.value })} />
            <Input
              name="email"
              type="email"
              aria-label="Email"
              placeholder="email@example.com"
              className="w-auto min-w-56 flex-[2]"
              value={r.email}
              onChange={(e) => set(i, { email: e.target.value })}
            />
            <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRows((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : [{ name: "", email: "" }]))}>
              <X />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          {rows.length < MAX_RECIPIENTS && (
            <Button variant="outline" size="sm" onClick={() => setRows((all) => [...all, { name: "", email: "" }])}>
              <Plus className="size-3.5" />
              Someone else
            </Button>
          )}
          {addable.length > 0 && rows.length < MAX_RECIPIENTS && (
            <select
              aria-label="Add a manager or office worker"
              className={`${selectClass} w-auto`}
              value=""
              onChange={(e) => {
                const p = people.find((x) => x.email === e.target.value);
                if (!p) return;
                setRows((all) => [...all.filter((r) => r.name || r.email), p]);
              }}
            >
              <option value="">Add a manager or office worker…</option>
              {addable.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : schedule ? "Save the schedule" : "Add the schedule"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}

/** A new schedule, behind a button. */
export function AddSchedule({ reportId, people }: { reportId: string; people: Recipient[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Email it on a schedule
      </Button>
    );
  }
  return <ScheduleForm reportId={reportId} people={people} onDone={() => setOpen(false)} />;
}

/** One schedule's buttons: change, pause or start, send now, remove. */
export function ScheduleActions({
  reportId,
  schedule,
  active,
  people,
}: {
  reportId: string;
  schedule: ScheduleDefaults;
  active: boolean;
  people: Recipient[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<SaveState & { sent?: number }>, ok?: (r: SaveState & { sent?: number }) => string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? (ok ? { ok: true, text: ok(r) } : null) : { ok: false, text: r.error ?? "Something went wrong." });
    });

  if (editing) return <ScheduleForm reportId={reportId} schedule={schedule} people={people} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(true)}>
        Change
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () => sendNowAction(schedule.id),
            (r) => `Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}.`,
          )
        }
      >
        Send now
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setScheduleActiveAction(schedule.id, !active))}>
        {active ? "Pause" : "Start again"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (confirm("Stop emailing this report to these people?")) run(() => deleteScheduleAction(schedule.id));
        }}
      >
        Remove
      </Button>
      {pending && <span className="text-xs text-muted-foreground">Working…</span>}
      {message && <span className={`text-xs ${message.ok ? "text-teal-700" : "text-red-700"}`}>{message.text}</span>}
    </div>
  );
}

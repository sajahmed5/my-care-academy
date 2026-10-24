"use client";

import { useActionState, useState } from "react";
import { CalendarCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultNextDue, dueStatus, type DueStatus } from "@/lib/records";
import {
  SUPERVISION_KINDS,
  kindLabel,
  nextDueOf,
  type Supervision,
} from "@/lib/supervisions";
import { addSupervisionAction, type SupervisionState } from "./actions";
import { formatDate } from "@/lib/dates";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const DUE_STYLE: Record<DueStatus, string> = {
  overdue: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  scheduled: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Supervisions and appraisals for one carer, newest first, with the banner a
 * manager actually scans for: when the next one is due.
 *
 * What was agreed is not kept here. It goes to the carer's task list, where it
 * sits beside their training and gets chased — see addSupervisionAction.
 */
export function SupervisionList({
  userId,
  supervisions,
}: {
  userId: string;
  supervisions: Supervision[];
}) {
  const now = new Date();
  const next = nextDueOf(supervisions);
  const status = dueStatus(next, now);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${DUE_STYLE[status]}`}
        >
          <CalendarCheck className="size-3.5" />
          {status === "none"
            ? "No next supervision scheduled"
            : `Next due ${fmtDate(next)}`}
        </span>
        <RecordSupervision userId={userId} />
      </div>

      {supervisions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nothing recorded yet. The first supervision you record will appear
            here, with whatever was agreed in their task list.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {supervisions.map((s) => (
            <Card key={s.id}>
              <CardContent className="space-y-2 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {kindLabel(s.kind)} · {fmtDate(s.held_on)}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {s.supervisor_name
                      ? `Held by ${s.supervisor_name}`
                      : "Supervisor no longer on the system"}
                  </span>
                </div>
                {s.summary && (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {s.summary}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {s.next_due ? `Next due ${fmtDate(s.next_due)}` : "No next date set"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordSupervision({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  // The next-due date follows the date it was held, on the organisation's
  // default interval, until somebody sets it themselves — after which it is
  // theirs and nothing moves it.
  const [on, setOn] = useState(todayISO);
  const [nextDue, setNextDue] = useState(() => defaultNextDue(todayISO(), "supervision"));
  const [ownNextDue, setOwnNextDue] = useState(false);
  const [state, formAction, pending] = useActionState<SupervisionState, FormData>(
    addSupervisionAction,
    {},
  );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Record a supervision
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="sv-kind">Type</Label>
              <select id="sv-kind" name="kind" className={selectClass} defaultValue="supervision">
                {SUPERVISION_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sv-held">Held on</Label>
              <Input
                id="sv-held"
                name="heldOn"
                type="date"
                required
                value={on}
                onChange={(e) => {
                  setOn(e.target.value);
                  if (!ownNextDue) setNextDue(defaultNextDue(e.target.value, "supervision"));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sv-next">Next due (optional)</Label>
              <Input
                id="sv-next"
                name="nextDue"
                type="date"
                value={nextDue}
                onChange={(e) => {
                  setOwnNextDue(true);
                  setNextDue(e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Every three months unless you change it.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sv-summary">What was discussed</Label>
            <textarea
              id="sv-summary"
              name="summary"
              rows={4}
              maxLength={5000}
              className={textareaClass}
              placeholder="A short note of the conversation."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1">
              <Label htmlFor="sv-agreed">What was agreed — one per line</Label>
              <textarea
                id="sv-agreed"
                name="agreed"
                rows={3}
                className={textareaClass}
                placeholder={"Book onto moving and handling\nChase the second reference"}
              />
              <p className="text-xs text-muted-foreground">
                Each line becomes an action in their task list.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sv-actions-due">Actions due by (optional)</Label>
              <Input id="sv-actions-due" name="actionsDue" type="date" />
            </div>
          </div>

          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          {state.ok && !state.error && (
            <p className="text-sm text-teal-700">
              Recorded
              {state.count ? ` — ${state.count} action${state.count === 1 ? "" : "s"} added to their list` : ""}.
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save record"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

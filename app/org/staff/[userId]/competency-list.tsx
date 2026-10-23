"use client";

import { useActionState, useState } from "react";
import { ClipboardCheck, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dueStatus, type DueStatus } from "@/lib/records";
import {
  COMPETENCY_AREAS,
  COMPETENCY_OUTCOMES,
  areaLabel,
  areasOfConcern,
  latestByArea,
  nextDueAcrossAreas,
  outcomeLabel,
  type CompetencyCheck,
} from "@/lib/competency";
import { addCompetencyCheckAction, type SupervisionState } from "./actions";

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

const OUTCOME_STYLE: Record<string, string> = {
  met: "bg-green-100 text-green-700",
  developing: "bg-amber-100 text-amber-700",
  not_met: "bg-rose-100 text-rose-700",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Spot checks for one carer, newest first.
 *
 * Two things lead, because they are what a manager is actually asked: when the
 * next check is due across every area, and whether anything came back short of
 * competent. The history below is the evidence for both.
 */
export function CompetencyList({
  userId,
  checks,
}: {
  userId: string;
  checks: CompetencyCheck[];
}) {
  const now = new Date();
  const next = nextDueAcrossAreas(checks);
  const status = dueStatus(next, now);
  const concerns = areasOfConcern(checks);
  const current = latestByArea(checks);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${DUE_STYLE[status]}`}
          >
            <ClipboardCheck className="size-3.5" />
            {status === "none" ? "No check scheduled" : `Next due ${fmtDate(next)}`}
          </span>
          {concerns.length > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              <TriangleAlert className="size-3.5" />
              {concerns.length === 1
                ? `${areaLabel(concerns[0].area)} needs attention`
                : `${concerns.length} areas need attention`}
            </span>
          )}
          {checks.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {current.size} area{current.size === 1 ? "" : "s"} checked
            </span>
          )}
        </div>
        <RecordCheck userId={userId} />
      </div>

      {checks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No spot checks yet. A certificate says they passed a test; a spot
            check says somebody watched them do it.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {checks.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-2 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {areaLabel(c.area)} · {fmtDate(c.checked_on)}
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        OUTCOME_STYLE[c.outcome] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {outcomeLabel(c.outcome)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.assessor_name
                        ? `Checked by ${c.assessor_name}`
                        : "Assessor no longer on the system"}
                    </span>
                  </div>
                </div>
                {c.notes && (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {c.notes}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {c.next_due ? `Next due ${fmtDate(c.next_due)}` : "No next date set"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordCheck({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SupervisionState, FormData>(
    addCompetencyCheckAction,
    {},
  );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Record a spot check
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cc-area">What was checked</Label>
              <select id="cc-area" name="area" className={selectClass} defaultValue="medication">
                {COMPETENCY_AREAS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-outcome">How it went</Label>
              <select id="cc-outcome" name="outcome" className={selectClass} defaultValue="met">
                {COMPETENCY_OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cc-checked">Checked on</Label>
              <Input id="cc-checked" name="checkedOn" type="date" required defaultValue={todayISO()} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-next">Next due (optional)</Label>
              <Input id="cc-next" name="nextDue" type="date" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cc-notes">What you saw</Label>
            <textarea
              id="cc-notes"
              name="notes"
              rows={3}
              maxLength={5000}
              className={textareaClass}
              placeholder="What was observed, and anything said at the time."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1">
              <Label htmlFor="cc-agreed">What happens next — one per line</Label>
              <textarea
                id="cc-agreed"
                name="agreed"
                rows={3}
                className={textareaClass}
                placeholder={"Repeat the check in three months\nRefresher on safe administration"}
              />
              <p className="text-xs text-muted-foreground">
                Each line becomes an action in their task list.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-actions-due">Actions due by (optional)</Label>
              <Input id="cc-actions-due" name="actionsDue" type="date" />
            </div>
          </div>

          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          {state.ok && !state.error && (
            <p className="text-sm text-teal-700">
              Recorded
              {state.count
                ? ` — ${state.count} action${state.count === 1 ? "" : "s"} added to their list`
                : ""}
              .
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save check"}
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

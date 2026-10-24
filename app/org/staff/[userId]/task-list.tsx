"use client";

import { useActionState, useState } from "react";
import { Check, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionRow, PersonTask, TaskUrgency } from "@/lib/person-tasks";
import { addPersonActionAction, setPersonActionDoneAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";
import { formatDate } from "@/lib/dates";

const URGENCY_STYLE: Record<TaskUrgency, string> = {
  overdue: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  open: "bg-muted text-muted-foreground",
};

const URGENCY_LABEL: Record<TaskUrgency, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  open: "Open",
};

function fmtDate(d: string | null): string {
  if (!d) return "No date";
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Everything outstanding for this carer, in one list: training, certificate
 * renewals and the actions somebody wrote down.
 *
 * Only the written-down ones can be ticked off here. A derived task is
 * completed by doing the work, and the training record on the same page would
 * contradict a tick that claimed otherwise.
 */
export function TaskList({
  userId,
  tasks,
  completed,
}: {
  userId: string;
  tasks: PersonTask[];
  completed: ActionRow[];
}) {
  return (
    <div className="space-y-3">
      <AddAction userId={userId} />

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nothing outstanding for this person.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.key}>
              <CardContent className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pt-6">
                <div className="space-y-1">
                  <p className="font-medium">{task.title}</p>
                  {task.detail && (
                    <p className="text-sm text-muted-foreground">{task.detail}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {task.source} · {fmtDate(task.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${URGENCY_STYLE[task.urgency]}`}
                  >
                    {URGENCY_LABEL[task.urgency]}
                  </span>
                  {task.actionId && (
                    <DoneButton
                      userId={userId}
                      actionId={task.actionId}
                      done={false}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <details className="rounded-lg border bg-muted/20 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Done ({completed.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {completed.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="text-muted-foreground line-through">{a.title}</span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  {fmtDate(a.completed_at)}
                  <DoneButton userId={userId} actionId={a.id} done />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DoneButton({
  userId,
  actionId,
  done,
}: {
  userId: string;
  actionId: string;
  done: boolean;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    setPersonActionDoneAction,
    {},
  );
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="actionId" value={actionId} />
      <input type="hidden" name="userId" value={userId} />
      {/* Ticking sends "1"; the undo on a done action sends "0". */}
      <input type="hidden" name="done" value={done ? "0" : "1"} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        title={state.error ?? undefined}
      >
        {done ? (
          <>
            <RotateCcw className="size-3.5" /> Undo
          </>
        ) : (
          <>
            <Check className="size-3.5" /> Done
          </>
        )}
      </Button>
    </form>
  );
}

function AddAction({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    addPersonActionAction,
    {},
  );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add an action
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-1">
            <Label htmlFor="action-title">What needs doing</Label>
            <Input
              id="action-title"
              name="title"
              required
              maxLength={200}
              placeholder="Book onto moving and handling"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="action-detail">Detail (optional)</Label>
              <Input id="action-detail" name="detail" maxLength={2000} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="action-due">Due (optional)</Label>
              <Input id="action-due" name="dueDate" type="date" />
            </div>
          </div>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          {/* Stays open on success: adding two or three in a row after a
              supervision is the common case, and the list below has already
              updated. */}
          {state.ok && !state.error && (
            <p className="text-sm text-teal-700">Added to the list below.</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add action"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

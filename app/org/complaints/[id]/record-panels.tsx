"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { pickable, type Complaint, type ComplaintAction, type StaffOption } from "@/lib/complaints/data";
import type { ComplaintStage } from "@/lib/complaints/stages";
import { actionTagFor } from "@/lib/complaints/compute";
import { closeComplaintAction, setActionDoneAction, setComplaintStatusAction, setPeopleAction } from "../actions";
import { selectClass, textareaClass } from "../new-complaint";
import { fmtDate } from "../complaint-row";
import type { SaveState } from "@/app/platform/actions";

/** The staff named in the record, and a way to add or remove one. */
export function PeopleNamed({ complaint, staff, disabled }: { complaint: Complaint; staff: StaffOption[]; disabled: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setPeopleAction, {});
  const named = new Set(complaint.people.map((p) => p.user_id));
  const candidates = pickable(staff).filter((s) => s.role === "learner" && !named.has(s.value));
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Staff named:</span>
        {complaint.people.length === 0 && <span className="text-muted-foreground">nobody yet</span>}
        {complaint.people.map((p) => (
          <span key={p.user_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            <Link href={`/org/staff/${p.user_id}`} className="hover:underline">{p.name ?? "someone no longer on the system"}</Link>
            {p.involvement !== "involved" && <span className="text-muted-foreground">· {p.involvement}</span>}
            {!disabled && (
              <>
                <Link
                  href={`/org/pips/new?user=${p.user_id}&complaint=${complaint.id}`}
                  className="ml-1 text-indigo-700 hover:underline"
                  title="Start a performance plan for this person, from this record"
                >
                  plan
                </Link>
                <form action={action} className="inline">
                  <input type="hidden" name="complaintId" value={complaint.id} />
                  <input type="hidden" name="userId" value={p.user_id} />
                  <input type="hidden" name="remove" value="1" />
                  <button type="submit" className="ml-1 text-muted-foreground hover:text-foreground" aria-label="Remove">×</button>
                </form>
              </>
            )}
          </span>
        ))}
      </div>
      {!disabled && candidates.length > 0 && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="complaintId" value={complaint.id} />
          <select name="userId" className={`${selectClass} h-8 w-auto`} defaultValue="">
            <option value="" disabled>Add someone…</option>
            {candidates.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select name="involvement" className={`${selectClass} h-8 w-auto`} defaultValue="involved">
            <option value="involved">Involved</option>
            <option value="witness">Witness</option>
            <option value="reported">Reported it</option>
          </select>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Add</Button>
          {state.error && <span className="text-rose-600">{state.error}</span>}
        </form>
      )}
    </div>
  );
}

/**
 * Closing. Refused with the same message the action gives, so nothing is
 * typed into a form that cannot be saved. Withdrawing or cancelling is a
 * different thing and is never held up.
 */
export function CloseRecord({
  complaint,
  stages,
  closeMessage,
  onOpenStage,
}: {
  complaint: Complaint;
  stages: ComplaintStage[];
  closeMessage: string;
  onOpenStage: (stageId: string) => void;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(closeComplaintAction, {});
  const [stState, stAction, stPending] = useActionState<SaveState, FormData>(setComplaintStatusAction, {});
  const closed = complaint.status !== "open";
  const openActions = complaint.actions.filter((a) => !a.completedAt);
  // Where each action was agreed, so the list can say so and open that stage.
  const agreedAt = (a: ComplaintAction) =>
    stages.find((s) => (s.kind === "meeting_minutes" || s.kind === "action_plan") && actionTagFor(s) === a.stageTag) ?? null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="font-medium">{closed ? `This record is ${complaint.status}` : "Close the record"}</p>

        {closed ? (
          <form action={stAction} className="space-y-2">
            <input type="hidden" name="complaintId" value={complaint.id} />
            <input type="hidden" name="status" value="open" />
            <p className="text-sm text-muted-foreground">
              {complaint.closedOn ? `Since ${complaint.closedOn}. ` : ""}Reopen it if there is more to do.
            </p>
            {stState.error && <p className="text-sm text-rose-600">{stState.error}</p>}
            <Button type="submit" variant="outline" size="sm" disabled={stPending}>Reopen</Button>
          </form>
        ) : (
          <>
            {closeMessage ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{closeMessage}</p>
            ) : (
              <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">Every stage is in. Say what came of it, and close.</p>
            )}
            {openActions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Actions still open</p>
                {openActions.map((a) => (
                  <OpenAction key={a.id} action={a} complaintId={complaint.id} stage={agreedAt(a)} onOpenStage={onOpenStage} />
                ))}
              </div>
            )}
            <form action={action} className="space-y-3">
              <input type="hidden" name="complaintId" value={complaint.id} />
              <div className="space-y-1">
                <Label htmlFor="close-outcome">What came of it</Label>
                <textarea
                  id="close-outcome"
                  name="outcomeSummary"
                  rows={4}
                  required
                  maxLength={5000}
                  className={textareaClass}
                  placeholder="What was found, what was done, and what was said to whoever raised it."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="close-lessons">What we learned</Label>
                <textarea id="close-lessons" name="lessonsLearned" rows={2} maxLength={5000} className={textareaClass} />
              </div>
              {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
              <Button type="submit" disabled={pending || !!closeMessage}>{pending ? "Closing…" : "Close the record"}</Button>
            </form>

            <div className="border-t pt-3">
              <p className="mb-2 text-xs text-muted-foreground">Not closing it, but it is not going on either:</p>
              <div className="flex gap-2">
                {(["withdrawn", "cancelled"] as const).map((s) => (
                  <form key={s} action={stAction}>
                    <input type="hidden" name="complaintId" value={complaint.id} />
                    <input type="hidden" name="status" value={s} />
                    <button type="submit" disabled={stPending} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      Mark {s}
                    </button>
                  </form>
                ))}
              </div>
              {stState.error && <p className="mt-1 text-sm text-rose-600">{stState.error}</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** An action still to tick off, with where it was agreed. */
function OpenAction({
  action: a,
  complaintId,
  stage,
  onOpenStage,
}: {
  action: ComplaintAction;
  complaintId: string;
  stage: ComplaintStage | null;
  onOpenStage: (stageId: string) => void;
}) {
  const [state, doneAction, pending] = useActionState<SaveState, FormData>(setActionDoneAction, {});
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
      <form action={doneAction}>
        <input type="hidden" name="complaintId" value={complaintId} />
        <input type="hidden" name="actionId" value={a.id} />
        <input type="hidden" name="done" value="1" />
        <button type="submit" disabled={pending} className="size-5 rounded border bg-background" aria-label="Mark done" />
      </form>
      <span>{a.title}</span>
      <span className="text-xs text-muted-foreground">
        {a.ownerName ?? "—"}
        {a.dueDate ? ` · by ${fmtDate(a.dueDate)}` : ""}
      </span>
      {stage && (
        <button type="button" onClick={() => onOpenStage(stage.id)} className="ml-auto text-xs text-indigo-700 hover:underline">
          agreed at {stage.name}
        </button>
      )}
      {state.error && <p className="w-full text-xs text-rose-600">{state.error}</p>}
    </div>
  );
}

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
import { SignaturePad } from "@/app/org/forms/[id]/fill/signature-pad";
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
  carerName,
  supervisions,
}: {
  userId: string;
  carerName: string;
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
        <RecordSupervision userId={userId} carerName={carerName} />
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
                <CarerSigned s={s} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** The carer's signature on a record, or why there is none. */
function CarerSigned({ s }: { s: Supervision }) {
  if (s.carer_signature) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t pt-2">
        {/* A data URL drawn on the pad, a few KB; nothing for next/image to do. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.carer_signature} alt={`Signature of ${s.carer_signed_name ?? "the carer"}`} className="h-10 rounded border bg-white" />
        <span className="text-xs text-muted-foreground">
          Signed by {s.carer_signed_name}
          {s.carer_signed_at ? ` on ${fmtDate(s.carer_signed_at)}` : ""}
        </span>
      </div>
    );
  }
  if (s.carer_unsigned_reason) {
    return <p className="border-t pt-2 text-xs text-amber-700">Not signed by the carer — {s.carer_unsigned_reason}</p>;
  }
  return <p className="border-t pt-2 text-xs text-muted-foreground">Recorded before carers signed supervisions.</p>;
}

function RecordSupervision({ userId, carerName }: { userId: string; carerName: string }) {
  const [open, setOpen] = useState(false);
  // The next-due date follows the date it was held, on the organisation's
  // default interval, until somebody sets it themselves — after which it is
  // theirs and nothing moves it.
  const [on, setOn] = useState(todayISO);
  const [nextDue, setNextDue] = useState(() => defaultNextDue(todayISO(), "supervision"));
  const [ownNextDue, setOwnNextDue] = useState(false);
  // The carer signs on this screen, at the time (CARER-FILE.md §9).
  const [signature, setSignature] = useState<string | null>(null);
  const [cannotSign, setCannotSign] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [state, formAction, pending] = useActionState<SupervisionState, FormData>(
    async (prev, fd) => {
      const r = await addSupervisionAction(prev, fd);
      // A saved record clears the pad, so the next one starts unsigned.
      if (r.ok) {
        setSignature(null);
        setCannotSign(false);
        setPadKey((k) => k + 1);
      }
      return r;
    },
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

          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              {carerName}&apos;s signature<span className="text-rose-600"> *</span>
            </legend>
            <p className="text-xs text-muted-foreground">
              Pass them the screen to sign that this is a fair record of the conversation.
            </p>
            <input type="hidden" name="carerSignature" value={cannotSign ? "" : (signature ?? "")} />
            {!cannotSign && (
              <>
                <SignaturePad key={padKey} onChange={setSignature} />
                <div className="space-y-1">
                  <Label htmlFor="sv-signed-name">Their name, typed by them</Label>
                  <Input id="sv-signed-name" name="carerSignedName" key={`n${padKey}`} defaultValue="" placeholder={carerName} />
                </div>
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="carerCannotSign"
                value="1"
                checked={cannotSign}
                onChange={(e) => setCannotSign(e.target.checked)}
              />
              They cannot sign now
            </label>
            {cannotSign && (
              <Input name="carerUnsignedReason" maxLength={500} required placeholder="Why — e.g. held by phone" />
            )}
          </fieldset>

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

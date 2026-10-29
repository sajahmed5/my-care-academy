"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CalendarCheck, CalendarPlus, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dueStatus, type DueStatus } from "@/lib/records";
import { AUDIT_KINDS } from "@/lib/audit-forms";
import { bookingWhen, kindLabel, nextDueOf, type Booking, type Supervision } from "@/lib/supervisions";
import { bookAuditAction, cancelBookingAction, type BookState } from "./supervision-actions";
import type { SaveState } from "@/app/platform/actions";
import { formatDate } from "@/lib/dates";
import { RaisePlan } from "./competency-list";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

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

export interface Holder {
  id: string;
  name: string;
}

/**
 * Supervisions and appraisals for one person: when each is next due, what is
 * booked, and every one held, newest first, with its answers.
 *
 * What was agreed is not kept here. It goes to their task list, where it sits
 * beside their training, gets chased, and comes back to be reviewed at the
 * next one.
 */
export function SupervisionList({
  userId,
  carerName,
  supervisions,
  bookings,
  holders,
  meId,
  canRaisePlan,
}: {
  userId: string;
  carerName: string;
  supervisions: Supervision[];
  bookings: Booking[];
  holders: Holder[];
  meId: string;
  /** Performance plans are in the package (people.performance_plans). */
  canRaisePlan: boolean;
}) {
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {AUDIT_KINDS.map((k) => {
          const next = nextDueOf(supervisions, k.value);
          const status = dueStatus(next, now);
          const booked = bookings.find((b) => b.kind === k.value);
          return (
            <span
              key={k.value}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${booked ? "bg-teal-50 text-teal-800" : DUE_STYLE[status]}`}
            >
              <CalendarCheck className="size-3.5" />
              {booked
                ? `${k.label} booked ${fmtDate(booked.booked_on)}`
                : status === "none"
                  ? `No ${k.label.toLowerCase()} scheduled`
                  : `${k.label} due ${fmtDate(next)}`}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/org/staff/${userId}/supervisions/new?kind=supervision`} className={buttonVariants({ variant: "outline" })}>
          <Plus className="size-4" /> Hold a supervision
        </Link>
        <Link href={`/org/staff/${userId}/supervisions/new?kind=appraisal`} className={buttonVariants({ variant: "outline" })}>
          <Plus className="size-4" /> Hold an appraisal
        </Link>
        <BookForm userId={userId} carerName={carerName} holders={holders} meId={meId} />
      </div>

      {bookings.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Booked</h3>
          <Card>
            <CardContent className="divide-y p-0">
              {bookings.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {kindLabel(b.kind)} · {bookingWhen(b, fmtDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[b.with_name ? `With ${b.with_name}` : null, b.location].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/org/staff/${userId}/supervisions/new?booking=${b.id}`}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Start
                    </Link>
                    <CancelBooking bookingId={b.id} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {supervisions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nothing recorded yet. The first supervision you hold will appear
            here, with whatever was agreed in their task list.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {supervisions.map((s) => (
            <SupervisionCard key={s.id} s={s} userId={userId} canRaisePlan={canRaisePlan} />
          ))}
        </div>
      )}
    </div>
  );
}

function SupervisionCard({ s, userId, canRaisePlan }: { s: Supervision; userId: string; canRaisePlan: boolean }) {
  const done = s.actions_review.filter((a) => a.status === "done").length;
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            {kindLabel(s.kind)} · {fmtDate(s.held_on)}
          </p>
          <span className="text-xs text-muted-foreground">
            {s.supervisor_name ? `Held by ${s.supervisor_name}` : "Supervisor no longer on the system"}
          </span>
        </div>
        {s.summary && <p className="whitespace-pre-line text-sm text-muted-foreground">{s.summary}</p>}
        <p className="text-xs text-muted-foreground">
          {s.next_due ? `Next due ${fmtDate(s.next_due)}` : "No next date set"}
          {s.actions_review.length > 0 && ` · last time's actions: ${done} of ${s.actions_review.length} done`}
        </p>
        {(s.answers.length > 0 || s.actions_review.length > 0) && (
          <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-primary">The answers</summary>
            <div className="mt-2 space-y-3">
              {s.actions_review.length > 0 && (
                <div>
                  <p className="font-medium">Last time&apos;s actions</p>
                  <ul className="mt-1 space-y-1">
                    {s.actions_review.map((a) => (
                      <li key={a.id} className="text-muted-foreground">
                        <span className={a.status === "done" ? "text-green-700" : "text-amber-700"}>
                          {a.status === "done" ? "Done" : "Not yet"}
                        </span>{" "}
                        — {a.title}
                        {a.comment ? `: ${a.comment}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {s.answers.map((a) => (
                <div key={a.id}>
                  <p className="font-medium">{a.label}</p>
                  <p className="whitespace-pre-line text-muted-foreground">{a.answer || "—"}</p>
                </div>
              ))}
            </div>
          </details>
        )}
        <Signatures s={s} />
        {canRaisePlan && <RaisePlan userId={userId} from={`supervision:${s.id}`} />}
      </CardContent>
    </Card>
  );
}

/** Both signatures on a record, or why the carer's is missing. */
function Signatures({ s }: { s: Supervision }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-2">
      {s.carer_signature ? (
        <span className="flex items-center gap-3">
          {/* A data URL drawn on the pad, a few KB; nothing for next/image to do. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.carer_signature} alt={`Signature of ${s.carer_signed_name ?? "the carer"}`} className="h-10 rounded border bg-white" />
          <span className="text-xs text-muted-foreground">
            Signed by {s.carer_signed_name}
            {s.carer_signed_at ? ` on ${fmtDate(s.carer_signed_at)}` : ""}
          </span>
        </span>
      ) : s.carer_unsigned_reason ? (
        <span className="text-xs text-amber-700">Not signed by them — {s.carer_unsigned_reason}</span>
      ) : (
        <span className="text-xs text-muted-foreground">Recorded before carers signed supervisions.</span>
      )}
      {s.manager_signature && (
        <span className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.manager_signature} alt={`Signature of ${s.manager_signed_name ?? "the manager"}`} className="h-10 rounded border bg-white" />
          <span className="text-xs text-muted-foreground">Signed by {s.manager_signed_name}</span>
        </span>
      )}
    </div>
  );
}

function CancelBooking({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(cancelBookingAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "…" : "Cancel"}
      </Button>
      {state.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}

/**
 * Book the next one. The person is emailed the date and who with, and sees
 * it on their own login; an appraisal opens their self-assessment.
 */
function BookForm({ userId, carerName, holders, meId }: { userId: string; carerName: string; holders: Holder[]; meId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<BookState, FormData>(async (prev, fd) => {
    const r = await bookAuditAction(prev, fd);
    if (r.ok) setOpen(false);
    return r;
  }, {});

  if (!open) {
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <CalendarPlus className="size-4" /> Book one
        </Button>
        {state.ok && <span className="self-center text-sm text-teal-700">Booked — {carerName} has been emailed.</span>}
      </>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="bk-kind">What</Label>
              <select id="bk-kind" name="kind" className={selectClass} defaultValue="supervision">
                {AUDIT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bk-on">Day</Label>
              <Input id="bk-on" name="bookedOn" type="date" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bk-time">Time (optional)</Label>
              <Input id="bk-time" name="bookedTime" type="time" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="bk-with">With</Label>
              <select id="bk-with" name="withUserId" className={selectClass} defaultValue={meId}>
                {holders.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bk-where">Where (optional)</Label>
              <Input id="bk-where" name="location" maxLength={200} placeholder="The office" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bk-note">A note for {carerName} (optional)</Label>
            <Input id="bk-note" name="note" maxLength={1000} placeholder="Bring your training certificates" />
            <p className="text-xs text-muted-foreground">It goes in their email. An appraisal also asks them for a short self-assessment first.</p>
          </div>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Booking…" : "Book and email them"}
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

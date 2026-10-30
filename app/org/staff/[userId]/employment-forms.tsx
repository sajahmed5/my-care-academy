"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bookProbationReviewAction, saveEmploymentAction, startProbationReviewAction } from "@/app/org/hr/probation/actions";

/** Start date, job title, and whether probation applies. */
export function EmploymentForm({ userId, startDate, jobTitle, noProbation }: { userId: string; startDate: string; jobTitle: string; noProbation: boolean }) {
  const router = useRouter();
  const [s, setS] = useState(startDate);
  const [j, setJ] = useState(jobTitle);
  const [none, setNone] = useState(noProbation);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveEmploymentAction(userId, { startDate: s, jobTitle: j, noProbation: none });
          setMessage(r.ok ? "Saved." : r.error ?? "That didn't save.");
          if (r.ok) router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <label htmlFor="emp-start" className="text-xs font-medium">Start date</label>
        <Input id="emp-start" type="date" value={s} onChange={(e) => setS(e.target.value)} className="w-40" />
      </div>
      <div className="space-y-1">
        <label htmlFor="emp-title" className="text-xs font-medium">Job title</label>
        <Input id="emp-title" value={j} onChange={(e) => setJ(e.target.value)} maxLength={80} placeholder="Care assistant" className="w-52" />
      </div>
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} /> Not on probation
      </label>
      <Button type="submit" size="sm" disabled={pending}>Save</Button>
      {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
    </form>
  );
}

/** One review point not yet held: book a date (they're emailed it), or hold it now. */
export function ProbationLine({ userId, dueOn, state, draft, bookedOn }: { userId: string; dueOn: string; state: string; draft: boolean; bookedOn: string | null }) {
  const router = useRouter();
  const [booking, setBooking] = useState(false);
  const [on, setOn] = useState(bookedOn ?? dueOn);
  const [time, setTime] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chip =
    state === "overdue" ? "bg-rose-100 text-rose-700" : state === "due_soon" ? "bg-amber-100 text-amber-700" : state === "booked" ? "bg-teal-50 text-teal-800" : "bg-muted text-muted-foreground";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip}`}>
        {state === "overdue" ? "Overdue" : state === "due_soon" ? "Due soon" : state === "booked" ? "Booked" : "Later"}
      </span>
      {booking ? (
        <>
          <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="h-8 w-36" aria-label="Date" />
          <Input value={time} onChange={(e) => setTime(e.target.value)} className="h-8 w-28" placeholder="Time" aria-label="Time" />
          <Button
            size="xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await bookProbationReviewAction(userId, dueOn, { bookedOn: on, bookedTime: time });
                if (!r.ok) return setMessage(r.error ?? "That didn't save.");
                setBooking(false);
                setMessage("Booked. They've been emailed the date.");
                router.refresh();
              })
            }
          >
            Book and tell them
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setBooking(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <Button size="xs" variant="outline" onClick={() => setBooking(true)}>{bookedOn ? "Change the date" : "Book it"}</Button>
          <Button
            size="xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await startProbationReviewAction(userId, dueOn);
                if (!r.ok || !r.id) return setMessage(r.error ?? "It couldn't be started.");
                router.push(`/org/hr/probation/review/${r.id}`);
              })
            }
          >
            {draft ? "Carry on with the review" : "Hold the review"}
          </Button>
        </>
      )}
      {message && <span role="status" className="w-full text-xs text-muted-foreground">{message}</span>}
    </div>
  );
}

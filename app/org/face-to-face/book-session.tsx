"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bookStaffAction, type BookState } from "./actions";

/** Book named staff onto one session: tick who's going, up to the places left. */
export function BookSession({
  sessionId,
  left,
  staff,
}: {
  sessionId: string;
  left: number;
  /** This company's staff not already booked on it. */
  staff: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState<BookState, FormData>(async (prev, fd) => {
    const r = await bookStaffAction(prev, fd);
    if (r.ok) {
      setPicked(new Set());
      setOpen(false);
    }
    return r;
  }, {});

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={staff.length === 0}>
          Book staff
        </Button>
        {state.ok && (
          <span className="text-sm text-teal-700">
            Booked {state.booked}. Each person has been sent a confirmation email.
          </span>
        )}
      </div>
    );
  }

  const shown = staff.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const over = picked.size > left;

  return (
    <form action={action} className="space-y-2 rounded-lg border p-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Who&apos;s going ({picked.size} of {left} place{left === 1 ? "" : "s"} left)
        </p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff" className="h-8 w-48" />
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {shown.map((s) => (
          <label key={s.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
            <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
            {s.name}
          </label>
        ))}
        {shown.length === 0 && <p className="text-xs text-muted-foreground">Nobody matches.</p>}
      </div>
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="person" value={id} />
      ))}
      {over && <p className="text-sm text-amber-700">That&apos;s more than the places left. Untick {picked.size - left}.</p>}
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || picked.size === 0 || over}>
          {pending ? "Booking…" : `Book ${picked.size || ""}`.trim()}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}

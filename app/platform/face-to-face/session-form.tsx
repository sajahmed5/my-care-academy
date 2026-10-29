"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SaveState } from "@/app/platform/actions";
import { createSessionAction, updateSessionAction } from "./actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export interface SessionDefaults {
  id: string;
  what: string;
  date: string;
  start: string;
  end: string;
  trainer: string;
  places: number;
  notes: string;
}

/**
 * One session: what it covers, when, who trains, and how many places. New
 * sessions open from a button, like recording a classroom session; an
 * existing one is edited in place on its own page.
 */
export function SessionForm({
  courses,
  closedDays,
  session,
}: {
  courses: { id: string; title: string }[];
  /** Closed days and why, so the form says so before the server does. */
  closedDays: Record<string, string | null>;
  session?: SessionDefaults;
}) {
  const editing = !!session;
  const [open, setOpen] = useState(editing);
  const [day, setDay] = useState(session?.date ?? "");
  const [state, action, pending] = useActionState<SaveState, FormData>(async (prev, fd) => {
    const r = await (editing ? updateSessionAction : createSessionAction)(prev, fd);
    // The rest of a new form resets itself after a save; the day is held here.
    if (r.ok && !editing) setDay("");
    return r;
  }, {});
  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Set up a session
        </Button>
        {state.ok && <p className="text-sm text-teal-700">Session set up.</p>}
      </div>
    );
  }

  const closed = day && day in closedDays;

  const form = (
    // Remounted when the saved session changes, so the fields take its new
    // values; the message above them lives outside and stays.
    <form action={action} key={session ? Object.values(session).join("|") : undefined} className="space-y-4">
      {session && <input type="hidden" name="id" value={session.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="f2f-what">What it covers</Label>
          <select id="f2f-what" name="what" required className={selectClass} defaultValue={session?.what ?? ""}>
            <option value="" disabled>Choose…</option>
            <option value="induction">Induction training</option>
            <option value="refresher">Annual refresher training</option>
            <optgroup label="Courses">
              {courses.map((c) => (
                <option key={c.id} value={`course:${c.id}`}>{c.title}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f2f-trainer">Trainer</Label>
          <Input id="f2f-trainer" name="trainer" defaultValue={session?.trainer} placeholder="Who runs it" maxLength={200} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="f2f-date">Day</Label>
          <Input
            id="f2f-date"
            name="date"
            type="date"
            required
            min={editing ? undefined : today}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f2f-start">Starts</Label>
          <Input id="f2f-start" name="start" type="time" required defaultValue={session?.start ?? "09:30"} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f2f-end">Finishes</Label>
          <Input id="f2f-end" name="end" type="time" required defaultValue={session?.end ?? "12:30"} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f2f-places">Places</Label>
          <Input id="f2f-places" name="places" type="number" required min={1} max={200} defaultValue={session?.places ?? 12} />
        </div>
      </div>
      {closed && (
        <p className="text-sm text-amber-700">
          That day is marked closed{closedDays[day] ? ` (${closedDays[day]})` : ""}. Nothing can be set up on it.
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor="f2f-notes">Notes (optional)</Label>
        <textarea id="f2f-notes" name="notes" rows={2} maxLength={2000} defaultValue={session?.notes} className={textareaClass} placeholder="Anything people should know: what to bring, what to wear" />
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && editing && <p className="text-sm text-teal-700">Saved.</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !!closed}>{pending ? "Saving…" : editing ? "Save changes" : "Set up session"}</Button>
        {!editing && (
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
        )}
      </div>
    </form>
  );

  if (editing) return form;
  return (
    <Card>
      <CardContent className="pt-6">
        {state.ok && <p className="mb-3 text-sm text-teal-700">Session set up. Set up another, or close.</p>}
        {form}
      </CardContent>
    </Card>
  );
}

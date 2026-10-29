"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChoiceButtons, PRACTICAL_OPTIONS } from "@/components/choice-buttons";
import { recordClassroomSessionAction, type ClassroomState } from "./actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Record a face-to-face session after the fact: what, when, who ran it, who
 * was there, and each person's practical result (29 Oct 2026). Passed is the
 * starting answer, as most people do; change it for anyone who didn't.
 */
export function RecordSession({
  courses,
  staff,
}: {
  courses: { id: string; title: string }[];
  staff: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionState<ClassroomState, FormData>(async (prev, fd) => {
    const r = await recordClassroomSessionAction(prev, fd);
    if (r.ok) {
      setPicked(new Set());
      setResults({});
    }
    return r;
  }, {});
  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <div className="space-y-2">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Record a session
        </Button>
        {state.ok && (
          <p className="text-sm text-teal-700">
            Recorded{state.certificates ? ` — ${state.certificates} certificate${state.certificates === 1 ? "" : "s"} issued` : ""}.
          </p>
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

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cs-title">What it was</Label>
              <Input id="cs-title" name="title" required placeholder="e.g. Moving and handling practical" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-course">Covers a course (optional)</Label>
              <select id="cs-course" name="courseId" className={selectClass} defaultValue="">
                <option value="">— none: record it on their file only —</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Pick one and each attendee who passed completes it, with a certificate.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="cs-date">Held on</Label>
              <Input id="cs-date" name="heldOn" type="date" required max={today} defaultValue={today} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-trainer">Trainer</Label>
              <Input id="cs-trainer" name="trainer" placeholder="Who ran it" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-duration">Minutes</Label>
              <Input id="cs-duration" name="duration" type="number" min={1} max={2880} placeholder="e.g. 180" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cs-location">Where</Label>
              <Input id="cs-location" name="location" placeholder="e.g. Office" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Who attended ({picked.size})</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff" className="h-8 w-48" />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
              {shown.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                  {s.name}
                </label>
              ))}
              {shown.length === 0 && <p className="text-xs text-muted-foreground">Nobody matches.</p>}
            </div>
            {[...picked].map((id) => (
              <input key={id} type="hidden" name="attendee" value={id} />
            ))}
          </div>
          {picked.size > 0 && (
            <div className="space-y-2">
              <Label>Practical result</Label>
              <ul className="divide-y rounded-lg border">
                {staff
                  .filter((p) => picked.has(p.id))
                  .map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      {p.name}
                      <ChoiceButtons
                        name={`practical:${p.id}`}
                        value={results[p.id] ?? "passed"}
                        onChange={(v) => setResults((prev) => ({ ...prev, [p.id]: v }))}
                        options={PRACTICAL_OPTIONS}
                      />
                    </li>
                  ))}
              </ul>
              <p className="text-xs text-muted-foreground">Only those who passed get a certificate.</p>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="cs-notes">Notes (optional)</Label>
            <textarea id="cs-notes" name="notes" rows={2} className={textareaClass} />
          </div>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save session"}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

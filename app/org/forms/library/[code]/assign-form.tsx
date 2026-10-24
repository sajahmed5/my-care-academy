"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignFormAction, type AssignState } from "../../library-actions";

/**
 * Ask people to complete this form.
 *
 * Everyone, or a picked few; a date, which lands in their task list; and a
 * note, which is the only place to say why. Someone who already has it open
 * is skipped, so asking "everyone" twice does not nag anyone. The people are
 * learners only — an admin has no page to open it on (issue #50).
 */
export function AssignForm({
  templateId,
  people,
}: {
  templateId: string;
  people: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [everyone, setEveryone] = useState(false);
  const [query, setQuery] = useState("");
  const [state, formAction, pending] = useActionState<AssignState, FormData>(assignFormAction, {});

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Ask someone to complete it
      </Button>
    );
  }

  const shown = people.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="templateId" value={templateId} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="everyone" value="1" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
            Everyone — all {people.length} active staff
          </label>

          {!everyone && (
            <div className="space-y-2">
              <Input placeholder="Find a person" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                {shown.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="userId" value={p.id} />
                    {p.name}
                  </label>
                ))}
                {shown.length === 0 && <p className="text-sm text-muted-foreground">Nobody matches.</p>}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="af-due">Due by (optional)</Label>
              <Input id="af-due" name="dueDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="af-note">Note to them (optional)</Label>
              <Input id="af-note" name="note" maxLength={300} placeholder="Before your supervision on Friday" />
            </div>
          </div>

          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          {state.ok && (
            <p className="text-sm text-teal-700">
              Asked {state.count} {state.count === 1 ? "person" : "people"}. It is in their task list now.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Ask"}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

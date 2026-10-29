"use client";

import { useActionState, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceButtons, PRACTICAL_OPTIONS } from "@/components/choice-buttons";
import { addAttendeeAction, finishSessionAction, removeAttendeeAction, type ClassroomState } from "../actions";

const selectClass = "flex h-9 rounded-lg border border-input bg-background px-3 text-sm";

/**
 * Who's signed in, each with their practical result, and Finish — which
 * issues the certificates. Someone without a phone is added by hand.
 */
export function FinishSession({
  sessionId,
  attendees,
  others,
  course,
}: {
  sessionId: string;
  attendees: { id: string; name: string; scanned: boolean }[];
  /** Current staff not signed in, to add by hand. */
  others: { id: string; name: string }[];
  course: boolean;
}) {
  const [results, setResults] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState("");
  const [busy, start] = useTransition();
  const [state, action, pending] = useActionState<ClassroomState, FormData>(finishSessionAction, {});
  const left = attendees.filter((a) => !results[a.id]).length;

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error) window.alert(r.error);
    });

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="sessionId" value={sessionId} />
        {attendees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has signed in yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {attendees.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title={`Take ${a.name} off`}
                    aria-label={`Take ${a.name} off`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Take ${a.name} off this session?`)) run(() => removeAttendeeAction(sessionId, a.id));
                    }}
                  >
                    <X className="size-4" />
                  </button>
                  <span className="font-medium">{a.name}</span>
                  {!a.scanned && <span className="text-xs text-muted-foreground">added by hand</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Practical</span>
                  <ChoiceButtons
                    name={`practical:${a.id}`}
                    value={results[a.id] ?? null}
                    onChange={(v) => setResults((prev) => ({ ...prev, [a.id]: v }))}
                    options={PRACTICAL_OPTIONS}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        {attendees.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={pending || left > 0}>
              {pending ? "Finishing…" : "Finish the session"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {left > 0
                ? `${left} still need a practical result.`
                : course
                  ? "Everyone who passed completes the course, with a certificate."
                  : "Recorded on each person's file."}
            </span>
          </div>
        )}
      </form>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="text-sm">Didn&apos;t scan in?</span>
          <select className={selectClass} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Who to add">
            <option value="">Choose someone…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!adding || busy}
            onClick={() => run(async () => {
              const r = await addAttendeeAction(sessionId, adding);
              if (r.ok) setAdding("");
              return r;
            })}
          >
            Add them
          </Button>
        </div>
      )}
    </div>
  );
}

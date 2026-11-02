"use client";

import { tooBigMessage } from "@/lib/upload-check";
import { useActionState, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  recordObservationAction,
  type ObsState,
} from "@/app/org/observations/actions";
import type { StandardObservation } from "@/lib/observations";

const inputClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";

const STATUS_LABEL: Record<string, string> = {
  pending: "Not yet observed",
  competent: "Competent",
  not_yet_competent: "Not yet competent",
};

export function StandardObservationRow({
  userId,
  standard,
}: {
  userId: string;
  standard: StandardObservation;
}) {
  const [open, setOpen] = useState(false);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    recordObservationAction,
    {} as ObsState,
  );

  const competent = standard.status === "competent";
  const dot =
    competent
      ? "bg-emerald-100 text-emerald-700"
      : standard.status === "not_yet_competent"
        ? "bg-rose-100 text-rose-700"
        : "bg-slate-100 text-slate-500";

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${dot}`}
          >
            {competent ? <Check className="size-4" /> : standard.standardNo}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{standard.label}</p>
            <p className="text-xs text-muted-foreground">
              Knowledge:{" "}
              {standard.knowledgeComplete ? (
                <span className="text-emerald-600">complete</span>
              ) : (
                <span>outstanding</span>
              )}{" "}
              · Observation: {STATUS_LABEL[standard.status]}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <form action={action} className="space-y-3 border-t p-3">
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="standard_no" value={standard.standardNo} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`status-${standard.standardNo}`}>Outcome</Label>
              <select
                id={`status-${standard.standardNo}`}
                name="status"
                defaultValue={standard.status}
                className={inputClass}
              >
                <option value="pending">Not yet observed</option>
                <option value="competent">Competent</option>
                <option value="not_yet_competent">Not yet competent</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`date-${standard.standardNo}`}>Date observed</Label>
              <input
                id={`date-${standard.standardNo}`}
                type="date"
                name="observed_at"
                defaultValue={standard.observedAt ?? ""}
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`notes-${standard.standardNo}`}>Notes</Label>
            <textarea
              id={`notes-${standard.standardNo}`}
              name="notes"
              rows={2}
              defaultValue={standard.notes ?? ""}
              placeholder="What did you observe?"
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={`evidence-${standard.standardNo}`}>
              Evidence (optional)
            </Label>
            <input
              id={`evidence-${standard.standardNo}`}
              type="file"
              name="evidence"
              className="text-sm"
              onChange={(e) => {
                const big = tooBigMessage(e.target.files?.[0], "The evidence file");
                if (big) e.target.value = "";
                setTooBig(big);
              }}
            />
            {tooBig && <p className="text-xs text-destructive">{tooBig}</p>}
            {standard.evidencePath && (
              <p className="text-xs text-muted-foreground">
                Evidence already attached.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save observation"}
            </Button>
            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            {state.ok && (
              <p className="text-sm text-emerald-700">Saved.</p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

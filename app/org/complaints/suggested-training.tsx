"use client";

import { useActionState, useState } from "react";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Suggestion } from "@/lib/complaints/categories";
import { assignConcernTrainingAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";

/**
 * The training a concern suggests for one person, each assignable with a
 * reason. Nothing here assigns anything on its own: the suggestion is the
 * platform's, the decision is the manager's, and complaint_training keeps it.
 * Used on a carer's file and on an accident's or near miss's actions.
 */
export function SuggestedTraining({
  complaintId,
  userId,
  personName,
  suggestions,
  disabled = false,
}: {
  complaintId: string;
  userId: string;
  /** Said when the list covers more than one person. */
  personName?: string | null;
  suggestions: Suggestion[];
  disabled?: boolean;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <GraduationCap className="size-3.5" />
        Suggested training{personName ? ` for ${personName}` : ""} — assign it if you think it is warranted
      </p>
      {suggestions.map((s) => (
        <SuggestionRow key={s.course.id} complaintId={complaintId} userId={userId} suggestion={s} disabled={disabled} />
      ))}
    </div>
  );
}

function SuggestionRow({
  complaintId,
  userId,
  suggestion,
  disabled,
}: {
  complaintId: string;
  userId: string;
  suggestion: Suggestion;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(assignConcernTrainingAction, {});

  if (suggestion.assigned || state.ok) {
    return (
      <p className="text-sm">
        <span className="font-medium">{suggestion.course.title}</span>{" "}
        <span className="text-muted-foreground">— assigned{suggestion.reason ? `: ${suggestion.reason}` : ""}</span>
      </p>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">{suggestion.course.title}</span>
        {!disabled && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Assign…
          </Button>
        )}
      </div>
    );
  }

  const fid = `${userId}-${suggestion.course.id}`;
  return (
    <form action={formAction} className="space-y-2 rounded-lg bg-muted/30 p-3">
      <input type="hidden" name="complaintId" value={complaintId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="courseId" value={suggestion.course.id} />
      <p className="text-sm font-medium">{suggestion.course.title}</p>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor={`reason-${fid}`}>Why you are assigning it</Label>
          <Input id={`reason-${fid}`} name="reason" maxLength={500} placeholder="Refresher after the medication error" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`due-${fid}`}>Due (optional)</Label>
          <Input id={`due-${fid}`} name="dueDate" type="date" />
        </div>
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Assigning…" : "Assign"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

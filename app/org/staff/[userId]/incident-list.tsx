"use client";

import { useActionState, useState } from "react";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  categoryLabel,
  kindLabel,
  statusLabel,
  type Incident,
  type Suggestion,
} from "@/lib/incidents";
import { assignSuggestedTrainingAction } from "@/app/org/incidents/actions";
import { RecordIncident } from "@/app/org/incidents/record-incident";
import type { SaveState } from "@/app/platform/actions";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-rose-100 text-rose-700",
  investigating: "bg-amber-100 text-amber-700",
  closed: "bg-green-100 text-green-700",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The complaints, accidents and concerns this carer is named in — and, under
 * each one, the training it suggests.
 *
 * Nothing here assigns anything on its own. The suggestion is the clever part;
 * the decision is the manager's, and it is recorded with their reason so the
 * file reads "reviewed and assigned on the 3rd" rather than "the system did
 * something to this carer on receipt of a complaint".
 */
export function IncidentList({
  userId,
  incidents,
  suggestions,
}: {
  userId: string;
  incidents: Incident[];
  suggestions: Record<string, Suggestion[]>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {incidents.length === 0
            ? "Nothing recorded against this person."
            : `${incidents.length} record${incidents.length === 1 ? "" : "s"} naming this person.`}
        </p>
        <RecordIncident userId={userId} />
      </div>

      {incidents.map((incident) => (
        <Card key={incident.id}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {kindLabel(incident.kind)} · {categoryLabel(incident.category)} ·{" "}
                {fmtDate(incident.occurred_on)}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  STATUS_STYLE[incident.status] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {statusLabel(incident.status)}
              </span>
            </div>

            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {incident.summary}
            </p>

            {incident.outcome && (
              <p className="rounded-lg bg-muted/40 p-3 text-sm">
                <span className="font-medium">Outcome:</span> {incident.outcome}
                {incident.closed_on && (
                  <span className="text-muted-foreground">
                    {" "}
                    · closed {fmtDate(incident.closed_on)}
                  </span>
                )}
              </p>
            )}

            {incident.people.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Also named:{" "}
                {incident.people
                  .filter((p) => p.user_id !== userId)
                  .map((p) => p.name ?? "someone no longer on the system")
                  .join(", ")}
              </p>
            )}

            <SuggestedTraining
              incidentId={incident.id}
              userId={userId}
              suggestions={suggestions[incident.id] ?? []}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SuggestedTraining({
  incidentId,
  userId,
  suggestions,
}: {
  incidentId: string;
  userId: string;
  suggestions: Suggestion[];
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <GraduationCap className="size-3.5" />
        Suggested training — assign it if you think it is warranted
      </p>
      {suggestions.map((s) => (
        <SuggestionRow
          key={s.course.id}
          incidentId={incidentId}
          userId={userId}
          suggestion={s}
        />
      ))}
    </div>
  );
}

function SuggestionRow({
  incidentId,
  userId,
  suggestion,
}: {
  incidentId: string;
  userId: string;
  suggestion: Suggestion;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    assignSuggestedTrainingAction,
    {},
  );

  if (suggestion.assigned || state.ok) {
    return (
      <p className="text-sm">
        <span className="font-medium">{suggestion.course.title}</span>{" "}
        <span className="text-muted-foreground">
          — assigned{suggestion.reason ? `: ${suggestion.reason}` : ""}
        </span>
      </p>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">{suggestion.course.title}</span>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Assign…
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-lg bg-muted/30 p-3">
      <input type="hidden" name="incidentId" value={incidentId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="courseId" value={suggestion.course.id} />
      <p className="text-sm font-medium">{suggestion.course.title}</p>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor={`reason-${suggestion.course.id}`}>Why you are assigning it</Label>
          <Input
            id={`reason-${suggestion.course.id}`}
            name="reason"
            maxLength={500}
            placeholder="Refresher after the medication error"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`due-${suggestion.course.id}`}>Due (optional)</Label>
          <Input id={`due-${suggestion.course.id}`} name="dueDate" type="date" />
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

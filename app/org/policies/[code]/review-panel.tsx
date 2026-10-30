"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SaveState } from "@/app/platform/actions";
import { fillDetailsAction, reviewNoChangeAction } from "../actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export interface ReviewEntry {
  id: string;
  at: string;
  by: string;
  outcome: "no_change" | "new_version";
  version: number;
  note: string | null;
}

/**
 * When this policy is next reviewed, and the reviews so far.
 *
 * A review with no change is one button and an optional note: the date moves
 * on and nobody re-accepts. A review that changes the policy is the editor
 * above — publishing it is the review. Managers only, as publishing is.
 */
export function ReviewPanel({
  copyId,
  code,
  dueLabel,
  overdue,
  periodLabel,
  canReview,
  history,
}: {
  copyId: string;
  code: string;
  /** "31 October 2027", or null when no date is set yet. */
  dueLabel: string | null;
  overdue: boolean;
  periodLabel: string;
  canReview: boolean;
  history: ReviewEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SaveState, FormData>(reviewNoChangeAction, {});

  return (
    <Card>
      <CardContent className="space-y-3 pt-6 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Review</h3>
          <p className="text-muted-foreground">{periodLabel}</p>
        </div>
        <p className={overdue ? "font-medium text-rose-700" : ""}>
          {dueLabel ? `${overdue ? "Overdue — was due" : "Next review"} ${dueLabel}.` : "No review date yet."}
        </p>

        {canReview ? (
          open ? (
            <form action={action} className="space-y-2">
              <input type="hidden" name="copyId" value={copyId} />
              <input type="hidden" name="code" value={code} />
              <label className="block text-xs text-muted-foreground" htmlFor="review-note">
                What you checked (optional) — for example the guidance or law you compared it with.
              </label>
              <textarea id="review-note" name="note" rows={2} maxLength={2000} className={textareaClass} />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Saving…" : "Reviewed — no changes needed"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
                Mark as reviewed
              </Button>
              <span className="text-xs text-muted-foreground">
                If it needs changing, edit it above and publish a new version instead — that counts as the review.
              </span>
            </div>
          )
        ) : (
          <p className="text-xs text-muted-foreground">A manager signs off reviews.</p>
        )}
        {state.error && <p className="text-rose-600">{state.error}</p>}
        {state.ok && <p className="text-teal-700">Review recorded. Nobody needs to accept it again.</p>}

        {history.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reviews so far ({history.length})
            </summary>
            <ul className="mt-2 divide-y">
              {history.map((h) => (
                <li key={h.id} className="py-1.5">
                  <p>
                    {h.at} · {h.by} ·{" "}
                    {h.outcome === "no_change" ? `no changes (version ${h.version})` : `published version ${h.version}`}
                  </p>
                  {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

/** Put the company's details into the copy, where fill-ins are waiting for them. */
export function FillDetailsButton({ copyId, code, missing }: { copyId: string; code: string; missing: string[] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(fillDetailsAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
      <input type="hidden" name="copyId" value={copyId} />
      <input type="hidden" name="code" value={code} />
      <span className="min-w-0 flex-1">
        This policy asks for your {missing.join(", ").toLowerCase()}. Fill them in from your company details (Settings → Policies).
      </span>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Filling in…" : "Fill in my details"}
      </Button>
      {state.error && <span className="w-full text-rose-600">{state.error}</span>}
    </form>
  );
}

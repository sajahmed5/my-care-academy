"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Assignment } from "@/lib/form-library";
import { unassignFormAction } from "../../library-actions";
import type { SaveState } from "@/app/platform/actions";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Who has been asked, who has done it, and the withdraw for an open ask. */
export function AssignmentList({ assignments }: { assignments: Assignment[] }) {
  const open = assignments.filter((a) => !a.completed_at);
  const done = assignments.filter((a) => a.completed_at);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Still to complete ({open.length})</h3>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is waiting on this form.</p>
          ) : (
            <ul className="divide-y text-sm">
              {open.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {a.user_name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {a.due_date ? `due ${fmtDate(a.due_date)}` : "no date"}
                    </span>
                  </span>
                  <WithdrawButton id={a.id} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {done.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Completed ({done.length})</summary>
            <ul className="mt-2 divide-y text-sm">
              {done.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{a.user_name}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(a.completed_at)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function WithdrawButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(unassignFormAction, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="assignmentId" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} title={state.error}>
        Withdraw
      </Button>
    </form>
  );
}

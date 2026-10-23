"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { setPackStatusAction, type LibraryState } from "./actions";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

/**
 * Move a whole pack at once.
 *
 * Reviewing 129 documents one at a time is how a library stays in draft for a
 * year. "Publish the policies, leave the forms" is the decision actually being
 * made, so it is the one the form offers.
 */
export function PackActions() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<LibraryState, FormData>(
    setPackStatusAction,
    {},
  );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Publish or withdraw a set
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="pk-pack">Pack</Label>
              <select id="pk-pack" name="pack" className={selectClass} defaultValue="">
                <option value="">Any pack</option>
                <option value="basic">CQC basics</option>
                <option value="full">Full compliance pack</option>
                <option value="addon">Add-on packs</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pk-kind">Type</Label>
              <select id="pk-kind" name="kind" className={selectClass} defaultValue="policy">
                <option value="">Any type</option>
                <option value="policy">Policies</option>
                <option value="form">Forms</option>
                <option value="log">Logs</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pk-status">Set to</Label>
              <select id="pk-status" name="status" className={selectClass} defaultValue="published">
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="retired">Retired</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Published documents are visible to every organisation whose plan
            includes that pack. Choosing &quot;any pack&quot; and &quot;any
            type&quot; at once is refused — that is the whole library.
          </p>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          {state.ok && (
            <p className="text-sm text-teal-700">
              {state.count ?? 0} document{state.count === 1 ? "" : "s"} changed.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Apply"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setPolicyStatusAction, type LibraryState } from "../actions";

/**
 * Publish, withdraw, retire — the one place a document's status changes.
 *
 * Buttons rather than a dropdown: there are three states and the one you want
 * is always the one you are not in, so making it a two-step choice would be
 * ceremony for its own sake.
 */
export function StatusForm({ code, status }: { code: string; status: string }) {
  const [state, formAction, pending] = useActionState<LibraryState, FormData>(
    setPolicyStatusAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 pt-1">
      <input type="hidden" name="code" value={code} />
      <span className="text-sm text-muted-foreground">
        Currently <span className="font-medium text-foreground">{status}</span>
      </span>
      {status !== "published" && (
        <Button type="submit" name="status" value="published" size="sm" disabled={pending}>
          Publish
        </Button>
      )}
      {status === "published" && (
        <Button
          type="submit"
          name="status"
          value="draft"
          size="sm"
          variant="outline"
          disabled={pending}
        >
          Back to draft
        </Button>
      )}
      {status !== "retired" && (
        <Button
          type="submit"
          name="status"
          value="retired"
          size="sm"
          variant="ghost"
          disabled={pending}
        >
          Retire
        </Button>
      )}
      {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
    </form>
  );
}

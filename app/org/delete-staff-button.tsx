"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteStaffAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";

/**
 * Permanently removes a staff member (issue #14). Confirms first — the delete
 * also removes their training history and certificates, so it's spelt out.
 */
export function DeleteStaffButton({
  userId,
  name,
  redirectTo,
}: {
  userId: string;
  name: string;
  /** Where to go once they're gone — from their own page, which goes with them. */
  redirectTo?: string;
}) {
  const [state, formAction, pending] = useActionState(
    deleteStaffAction,
    {} as SaveState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.error) window.alert(state.error);
    else if (state.ok && redirectTo) router.replace(redirectTo);
  }, [state, redirectTo, router]);

  function onSubmit(e: React.FormEvent) {
    if (
      !window.confirm(
        `Delete ${name}? This permanently removes their account, training history and certificates. This cannot be undone.`,
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        title={`Delete ${name}`}
        // Quiet until you reach for it: red outlined on every row of the staff
        // list, it was the loudest thing on the page for the action you least
        // want (design review, 28 Oct 2026). It still asks first.
        className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive disabled:opacity-50 sm:min-h-0"
      >
        <Trash2 className="size-3.5" />
        {pending ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}

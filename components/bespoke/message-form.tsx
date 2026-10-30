"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { SaveState } from "@/app/platform/actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Write on a request. The action is bound to the request on the server. */
export function MessageForm({
  action,
  placeholder,
}: {
  action: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  placeholder: string;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={formAction} className="space-y-2">
      <label htmlFor="message-body" className="sr-only">
        Message
      </label>
      <textarea id="message-body" name="body" rows={3} maxLength={4000} required placeholder={placeholder} className={textareaClass} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="text-sm text-teal-700">Sent.</p>}
      </div>
    </form>
  );
}

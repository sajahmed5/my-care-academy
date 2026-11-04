"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * A plain form, so it works before (or without) JavaScript; the script only
 * stops a double press, which would spend the link and then report it used.
 */
export function ContinueForm({ tokenHash, type, next }: { tokenHash: string; type: string; next: string }) {
  const [sending, setSending] = useState(false);
  return (
    <form
      method="post"
      action="/auth/verify"
      onSubmit={(e) => {
        if (sending) e.preventDefault();
        else setSending(true);
      }}
    >
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" className="w-full" autoFocus aria-disabled={sending || undefined}>
        {sending ? "Just a moment…" : "Continue"}
      </Button>
    </form>
  );
}

"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelSessionAction } from "../actions";

/** Cancel a session. It stays on the list, struck through, as a record. */
export function CancelSession({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="border-t pt-4">
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Cancel ${title}? Nobody will be able to book it.`)) return;
          start(async () => {
            const r = await cancelSessionAction(id);
            if (r.error) window.alert(r.error);
          });
        }}
      >
        {pending ? "Cancelling…" : "Cancel this session"}
      </Button>
    </div>
  );
}

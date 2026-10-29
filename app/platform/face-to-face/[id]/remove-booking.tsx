"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { removeBookingAction } from "../actions";

/** Cancel one person's place from our side; they're emailed as for any cancellation. */
export function RemoveBooking({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Cancel ${name}'s place? They'll get an email saying so.`)) return;
        start(async () => {
          const r = await removeBookingAction(id);
          if (r.error) window.alert(r.error);
        });
      }}
    >
      {pending ? "Cancelling…" : "Cancel place"}
    </Button>
  );
}

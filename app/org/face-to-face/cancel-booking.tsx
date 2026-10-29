"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelBookingAction } from "./actions";

/** Give a place back, 48 hours or more before. The person is told by email. */
export function CancelBooking({ id, name }: { id: string; name: string }) {
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
          const r = await cancelBookingAction(id);
          if (r.error) window.alert(r.error);
        });
      }}
    >
      {pending ? "Cancelling…" : "Cancel place"}
    </Button>
  );
}

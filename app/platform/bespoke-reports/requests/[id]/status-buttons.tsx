"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setRequestStatusAction } from "../../actions";

const NEXT: Record<string, { status: string; label: string }[]> = {
  asked: [{ status: "building", label: "Start building" }],
  building: [
    { status: "ready", label: "Mark ready" },
    { status: "asked", label: "Back to asked" },
  ],
  ready: [{ status: "building", label: "Back to being built" }],
};

/** Move a request along. The manager who asked is emailed when it starts and when it's ready. */
export function StatusButtons({ requestId, status }: { requestId: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = NEXT[status] ?? [];
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o, i) => (
        <Button
          key={o.status}
          variant={i === 0 ? "default" : "outline"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setRequestStatusAction(requestId, o.status);
              setError(r.ok ? null : (r.error ?? "Something went wrong."));
            })
          }
        >
          {o.label}
        </Button>
      ))}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

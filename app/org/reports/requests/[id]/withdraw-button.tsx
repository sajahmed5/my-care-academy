"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { withdrawRequestAction } from "../../actions";

/** Withdraw a request that's still with us, after a confirm. */
export function WithdrawButton({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!confirm("Withdraw this request? We'll stop work on it.")) return;
          start(async () => {
            const r = await withdrawRequestAction(requestId);
            setError(r.ok ? null : (r.error ?? "Something went wrong."));
          });
        }}
      >
        {pending ? "Withdrawing…" : "Withdraw the request"}
      </Button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

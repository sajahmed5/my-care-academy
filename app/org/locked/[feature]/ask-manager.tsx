"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { askManagerAction } from "./actions";

/** An office worker can't change the package; they can tell the manager who can. */
export function AskManager({ feature }: { feature: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  return (
    <>
      <p className="min-w-60 flex-1 text-sm">
        <span className="font-semibold">Ask your manager.</span> Only a manager can change your company&apos;s package.
      </p>
      {result?.ok ? (
        <p role="status" className="text-sm font-medium text-primary">
          Done. Your manager has an email about it.
        </p>
      ) : (
        <Button
          variant="outline"
          size="lg"
          disabled={pending}
          onClick={() => start(async () => setResult(await askManagerAction(feature)))}
        >
          {pending ? "Sending…" : "Let my manager know"}
        </Button>
      )}
      {result && !result.ok && (
        <p role="alert" className="w-full text-sm text-destructive">
          {result.error}
        </p>
      )}
    </>
  );
}

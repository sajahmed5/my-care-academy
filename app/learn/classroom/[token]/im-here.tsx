"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInToClassroomAction } from "./actions";

/** One big button, then a tick. */
export function ImHere({ token, done, name }: { token: string; done: boolean; name: string }) {
  const [signedIn, setSignedIn] = useState(done);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (signedIn) {
    return (
      <p className="flex items-center justify-center gap-2 text-base font-medium text-teal-700">
        <CheckCircle2 className="size-5" aria-hidden="true" />
        You&apos;re signed in{name ? `, ${name}` : ""}.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="min-h-12 w-full text-base"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await signInToClassroomAction(token);
            if (r.ok) setSignedIn(true);
            else setError(r.error ?? "That didn't work.");
          })
        }
      >
        {pending ? "Signing in…" : "I'm here"}
      </Button>
      {name && <p className="text-xs text-muted-foreground">Signing in as {name}. Not you? Sign out first.</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction, type ResetState } from "./actions";

const initial: ResetState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      {state.message && (
        <p
          role="status"
          className={
            state.ok
              ? "rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
              : "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {state.message}
        </p>
      )}

      {/* Someone who can't get in can't be told to "email us from the address
          you can't reach" and nothing else — the contact page takes a message
          without a mail client. */}
      {state.ok && (
        <p className="text-xs text-muted-foreground">
          Still stuck? Ask your manager to re-send your invitation, or{" "}
          <Link href="/contact" className="text-primary hover:underline">
            get in touch with us
          </Link>
          .
        </p>
      )}

      {state.link && (
        <p className="break-all rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
          Development only — email isn&apos;t configured, so use this link to
          reset:{" "}
          <a href={state.link} className="text-primary underline">
            {state.link}
          </a>
        </p>
      )}
    </form>
  );
}

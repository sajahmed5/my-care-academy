"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/pill";
import { TemporaryPasswordReveal } from "@/components/temporary-password-reveal";
import { setStaffTemporaryPasswordAction, type StaffPasswordState } from "./password-actions";

/**
 * "Signing in" on a person's Overview, for managers (ACCOUNT-ACCESS.md): whether
 * they've ever signed in, and a temporary password for when the invitation
 * didn't arrive or didn't work.
 */
export function SigningIn({
  userId,
  name,
  email,
  lastSeen,
}: {
  userId: string;
  name: string;
  email: string | null;
  /** "12 Oct 2026", or null if they've never signed in. */
  lastSeen: string | null;
}) {
  const [state, formAction, pending] = useActionState(setStaffTemporaryPasswordAction, {} as StaffPasswordState);
  return (
    <section aria-labelledby="signing-in-heading" className="space-y-3 rounded-card border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="signing-in-heading" className="font-bold">Signing in</h2>
        {lastSeen ? <Pill tone="ok">Last active {lastSeen}</Pill> : <Pill tone="danger">Never signed in</Pill>}
      </div>
      <p className="text-sm text-muted-foreground">
        {lastSeen
          ? `If ${name} can't get in, give them a temporary password. They choose their own when they next sign in.`
          : `If the invitation hasn't arrived, or their email blocks it, give ${name} a temporary password instead.`}
      </p>
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.password && <TemporaryPasswordReveal name={name} email={email} password={state.password} />}
      <form
        action={formAction}
        onSubmit={(e) => {
          if (lastSeen && !window.confirm(`Give ${name} a temporary password? The password they use now stops working.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="outline" disabled={pending}>
          <KeyRound className="size-4" aria-hidden />
          {pending ? "Setting…" : state.password ? "Set a new temporary password" : "Set temporary password"}
        </Button>
      </form>
    </section>
  );
}

"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { TemporaryPasswordReveal } from "@/components/temporary-password-reveal";
import {
  resendAccountEmailAction,
  setTemporaryPasswordAction,
  type ResendState,
  type TemporaryPasswordState,
} from "../../admin-actions";

/** Send again with a fresh link, or a temporary password instead. */
export function EmailActions({ orgId, emailId, userId, name, email }: { orgId: string; emailId: string; userId: string; name: string; email: string }) {
  const [resend, resendAction, resending] = useActionState(resendAccountEmailAction, {} as ResendState);
  const [temp, tempAction, setting] = useActionState(setTemporaryPasswordAction, {} as TemporaryPasswordState);
  const error = resend.error ?? temp.error;
  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {resend.message && (
        <p role="status" className="rounded-lg bg-ok px-3 py-2 text-sm text-ok-foreground">
          {resend.message}
        </p>
      )}
      {temp.password && <TemporaryPasswordReveal name={name} email={email} password={temp.password} />}
      <form action={resendAction}>
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="emailId" value={emailId} />
        <Button type="submit" className="w-full" disabled={resending}>
          {resending ? "Sending…" : "Send again with a fresh link"}
        </Button>
      </form>
      <form
        action={tempAction}
        onSubmit={(e) => {
          if (!window.confirm(`Give ${name} a temporary password? The password they use now, if any, stops working.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="outline" className="w-full" disabled={setting}>
          {setting ? "Setting…" : "Set a temporary password instead"}
        </Button>
      </form>
    </div>
  );
}

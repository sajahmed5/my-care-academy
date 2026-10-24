"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NameForm, PasswordChangeForm } from "@/components/account-fields";
import { sendMyPasswordResetAction, updateMyNameAction } from "./actions";

/**
 * The signed-in manager's own details.
 *
 * Name and password are theirs to change here, the same two fields a carer
 * gets at /learn/profile. Both were read-only: the name as plain text with no
 * way to correct a typo, the password as ten bullets and a "Reset by email"
 * button — a round trip through an inbox to do what one form does. The email
 * route stays for anyone who would rather have the link, or who is about to
 * be locked out of a session.
 */
export function AccountDetails({
  fullName,
  email,
}: {
  fullName: string | null;
  email: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    const res = await sendMyPasswordResetAction();
    setBusy(false);
    setMessage(
      res.ok
        ? "Password reset email sent — check your inbox."
        : (res.error ?? "Could not send the reset email."),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-muted-foreground">Email (username)</span>
        <span className="font-medium">{email ?? "—"}</span>
      </div>

      <NameForm
        initial={fullName ?? ""}
        action={updateMyNameAction}
        label="Your name"
      />

      <div className="space-y-3 border-t pt-5">
        <PasswordChangeForm />
        <p className="text-xs text-muted-foreground">
          Would rather do it by email?{" "}
          <Button
            variant="link"
            size="xs"
            className="h-auto p-0 text-xs"
            onClick={reset}
            disabled={busy}
          >
            {busy ? "Sending…" : "Send me a reset link"}
          </Button>
          {message && <span className="ml-2">{message}</span>}
        </p>
      </div>
    </div>
  );
}

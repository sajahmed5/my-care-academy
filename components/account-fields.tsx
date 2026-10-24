"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * The two things anyone should be able to change about their own account:
 * their name and their password.
 *
 * Shared because they were a learner's alone. A manager's own details sat on
 * the Account page as read-only text — their name shown with no way to correct
 * it, their password only resettable by round-tripping through an email — so
 * the person who can rename every carer in the organisation could not fix the
 * spelling of their own name.
 *
 * The name form takes its action as a prop: the role check belongs with the
 * caller (a learner's action writes as a learner, a console user's as a
 * console user), not in a shared component.
 */

export type NameAction = (
  fullName: string,
) => Promise<{ ok: boolean; error?: string }>;

export function NameForm({
  initial,
  action,
  label = "Display name",
}: {
  initial: string;
  action: NameAction;
  label?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unchanged = name.trim() === initial.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await action(name);
    setBusy(false);
    setMsg(res.ok ? "Saved." : (res.error ?? "Could not save that name."));
    if (res.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="full-name">{label}</Label>
        <Input
          id="full-name"
          value={name}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy || unchanged}>
          {busy ? "Saving…" : "Save name"}
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}

/** Kept in step with the hint under the field and with /auth/set-password. */
const MIN_LENGTH = 8;

// The browser Supabase client is ~58 KB gzipped and only this form's submit
// needs it, so it is fetched on demand rather than with the page (it was in
// /account and /learn/profile's first load). Focusing the form starts the
// download, so by the time the password is typed it is already there.
const loadSupabase = () => import("@/lib/supabase/client");

export function PasswordChangeForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (password.length < MIN_LENGTH) {
      setError(`Your password needs to be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    let error: { message: string } | null;
    try {
      const { createClient } = await loadSupabase();
      ({ error } = await createClient().auth.updateUser({ password }));
    } catch {
      // The chunk itself failed to load (signal dropped mid-save).
      error = { message: "" };
    }
    setBusy(false);
    if (error) {
      setError(
        friendlyAuthError(
          error.message,
          "We couldn't save that password. Please try again.",
        ),
      );
      return;
    }
    setMsg("Password updated.");
    setPassword("");
    setConfirm("");
  }

  return (
    <form
      onSubmit={save}
      onFocus={() => void loadSupabase()}
      className="space-y-3"
    >
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          aria-describedby="new-password-hint"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p id="new-password-hint" className="text-xs text-muted-foreground">
          At least {MIN_LENGTH} characters.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          aria-invalid={mismatch || undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && (
          <p className="text-xs text-destructive">
            The two passwords don&apos;t match yet.
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Updating…" : "Change password"}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
        {msg && (
          <span className="text-sm text-green-700 dark:text-green-500">{msg}</span>
        )}
      </div>
    </form>
  );
}

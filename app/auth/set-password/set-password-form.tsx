"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

/** Kept in step with the hint under the field and with the learner profile. */
const MIN_LENGTH = 8;

// The browser Supabase client is ~58 KB gzipped and only the submit needs it,
// so it is fetched on demand rather than with the page. The field is
// autofocused, so the download starts as soon as the form is on screen.
const loadSupabase = () => import("@/lib/supabase/client");

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Your password needs to be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setLoading(true);
    let error: { message: string } | null;
    try {
      const { createClient } = await loadSupabase();
      ({ error } = await createClient().auth.updateUser({ password }));
    } catch {
      // The chunk itself failed to load (signal dropped mid-save).
      error = { message: "" };
    }
    if (error) {
      setError(
        friendlyAuthError(
          error.message,
          "We couldn't save that password. Please try again.",
        ),
      );
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      onFocus={() => void loadSupabase()}
      onInput={() => void loadSupabase()}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          autoFocus
          required
          aria-invalid={tooShort || undefined}
          aria-describedby="password-hint"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {/* The rule is stated up front rather than sprung as an error after a
            failed submit — this is someone's first minute in the product. */}
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least {MIN_LENGTH} characters. Use something you&apos;ll remember.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          required
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

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving…" : "Set password & continue"}
      </Button>
    </form>
  );
}

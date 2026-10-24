"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

// The browser Supabase client is ~58 KB gzipped and only the submit needs it,
// so it stays out of the login page's first load (a carer's first screen on a
// phone). Focusing or typing in the form starts the download, so it is there
// before the password is.
const loadSupabase = () => import("@/lib/supabase/client");

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let error: { message: string } | null;
    try {
      const { createClient } = await loadSupabase();
      // Trimmed and lower-cased before it leaves the page: a pasted address or
      // a phone keyboard's capitalised first letter is a typo we can absorb,
      // not one to answer with "that email and password don't match".
      ({ error } = await createClient().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      }));
    } catch {
      // The chunk itself failed to load (signal dropped) — say so as one.
      error = { message: "network" };
    }

    if (error) {
      setError(friendlyAuthError(error.message));
      setLoading(false);
      return;
    }

    // Let the server re-read the refreshed session, then route by role.
    router.replace(redirectTo);
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
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          // Caps Lock is the quiet cause of a lot of failed sign-ins, and the
          // field hides the evidence.
          onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
        />
        {capsLock && (
          <p className="text-xs text-muted-foreground">
            Caps Lock is on.
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
        {loading ? "Signing in…" : "Sign in"}
      </Button>

      <Link
        href="/forgot-password"
        className="block text-center text-sm text-muted-foreground hover:underline"
      >
        Forgot your password?
      </Link>
    </form>
  );
}

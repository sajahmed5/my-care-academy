"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "enroll" | "challenge";

export function MfaSetup({
  mode,
  factorId: initialFactorId,
}: {
  mode: Mode;
  factorId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [factorId, setFactorId] = useState<string | undefined>(initialFactorId);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const started = mode === "challenge" || qr !== null;

  async function startEnroll() {
    setError(null);
    setLoading(true);

    // Clear any half-finished (unverified) TOTP factors first.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `authenticator-${Date.now()}`,
    });
    if (error) {
      setError(
        friendlyAuthError(
          error.message,
          "We couldn't start the setup. Please try again.",
        ),
      );
      setLoading(false);
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setLoading(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setLoading(true);

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setError(
        friendlyAuthError(
          challengeError.message,
          "We couldn't check that code. Please try again.",
        ),
      );
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (verifyError) {
      setError(
        friendlyAuthError(
          verifyError.message,
          "That code wasn't right. Check your authenticator app and enter the current 6-digit code.",
        ),
      );
      setCode("");
      setLoading(false);
      return;
    }

    // Session is now AAL2 — go to the role dashboard.
    router.replace("/dashboard");
    router.refresh();
  }

  if (!started) {
    return (
      <div className="space-y-4">
        {/* "Admin accounts" is the wrong name for two of the three roles that
            land here — an office worker and a manager are not admins — and it
            told them what to do without saying why. */}
        <p className="text-sm text-muted-foreground">
          Your account can see other people&apos;s training records, so it&apos;s
          protected with a second step at sign-in. You&apos;ll need an
          authenticator app on your phone — Google Authenticator, Microsoft
          Authenticator, 1Password or Authy all work.
        </p>
        <p className="text-sm text-muted-foreground">
          It takes about a minute, and you only do it once.
        </p>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button onClick={startEnroll} disabled={loading}>
          {loading ? "Preparing…" : "Set up two-factor authentication"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      {mode === "enroll" && qr && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Scan this QR code with your authenticator app, then enter the
            6-digit code it shows.
          </p>
          <Image
            src={qr}
            alt="TOTP QR code"
            width={200}
            height={200}
            unoptimized
            className="rounded border bg-white p-2"
          />
          {secret && (
            <p className="text-xs text-muted-foreground">
              Or enter this key manually: <code>{secret}</code>
            </p>
          )}
        </div>
      )}

      {mode === "challenge" && (
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="code">Authentication code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
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
        {loading ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );
}

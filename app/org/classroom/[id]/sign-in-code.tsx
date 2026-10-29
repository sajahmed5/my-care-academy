"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showSignInCodeAction } from "../actions";

/**
 * The QR code people scan to sign in, big enough to read across a room.
 * While it's up, the list of who's signed in refreshes itself.
 */
export function SignInCode({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [qr, setQr] = useState<{ image: string; link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [qr, router]);

  const show = () =>
    start(async () => {
      setError(null);
      const r = await showSignInCodeAction(sessionId);
      if (!r.ok || !r.link) return setError(r.error ?? "That didn't work.");
      setQr({ link: r.link, image: await QRCode.toDataURL(r.link, { margin: 1, width: 480 }) });
    });

  if (!qr) {
    return (
      <div className="space-y-2">
        <Button size="lg" onClick={show} disabled={pending}>
          <QrCode className="size-4" />
          {pending ? "Making the code…" : "Show the sign-in code"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Each person scans it with their phone camera, signs in to their own account if asked, and presses
          &ldquo;I&apos;m here&rdquo;.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made in the browser */}
      <img src={qr.image} alt="QR code to sign in to this session" className="size-72 sm:size-96" />
      <p className="text-sm font-medium text-slate-800">Scan to sign in</p>
      <p className="max-w-sm break-all text-xs text-slate-500">{qr.link}</p>
      <Button variant="ghost" size="sm" onClick={() => setQr(null)}>
        Hide the code
      </Button>
    </div>
  );
}

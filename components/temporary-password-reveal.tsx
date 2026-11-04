"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * A temporary password, shown once to whoever set it (lib/temporary-password).
 * Nothing else ever shows it again: it isn't stored or emailed.
 */
export function TemporaryPasswordReveal({ name, email, password }: { name: string; email: string | null; password: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // No clipboard (an old browser or an insecure page): it's on screen to copy by hand.
    }
  }
  return (
    <div role="status" className="space-y-3 rounded-card border bg-muted/50 p-4">
      <p className="font-bold">Temporary password for {name}</p>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card py-2 pl-4 pr-2">
        <span className="flex-1 font-mono text-xl font-semibold tracking-wider">{password}</span>
        <Button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Shown once. Copy it now: it can&apos;t be shown again, only replaced.</li>
        <li>Nothing has been emailed. Send it to {name} yourself, by text or phone.</li>
        {email && <li>{name} signs in with {email} and this password.</li>}
        <li>On that first sign-in they&apos;re asked to choose their own password.</li>
      </ul>
    </div>
  );
}

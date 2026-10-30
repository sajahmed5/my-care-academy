"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { issueKeyAction, revokeKeyAction } from "./actions";

/** A key, shown once, with how to use it. */
function NewKey({ value, children }: { value: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Copy this key now. It won&apos;t be shown again.</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-white px-2 py-1 text-xs">{value}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
          }}
        >
          <Copy className="size-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {children}
    </div>
  );
}

/**
 * Connect MyRoster, replace its key, or disconnect it. The new key is shown
 * here once, with where it goes.
 */
export function MyRosterControls({
  keyId,
  apiAddress,
}: {
  keyId: string | null;
  apiAddress: string;
}) {
  const [pending, start] = useTransition();
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function connect() {
    if (keyId && !window.confirm("Replace the key? MyRoster stops syncing until you enter the new one there.")) return;
    setError(null);
    start(async () => {
      const r = await issueKeyAction("myroster");
      if (!r.ok || !r.key) return setError(r.error ?? "Could not make a key.");
      setKey(r.key);
    });
  }

  function disconnect() {
    if (!keyId || !window.confirm("Disconnect MyRoster? It stops sending carers and reading training records at once.")) return;
    setError(null);
    start(async () => {
      const r = await revokeKeyAction(keyId);
      if (!r.ok) setError(r.error ?? "Could not disconnect.");
      setKey(null);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={connect} disabled={pending}>
          {keyId ? "Replace key" : "Connect MyRoster"}
        </Button>
        {keyId && (
          <Button size="sm" variant="outline" onClick={disconnect} disabled={pending}>
            Disconnect
          </Button>
        )}
      </div>
      {key && (
        <NewKey value={key}>
          <p>
            In MyRoster, open the My Care Academy connection settings and paste this key, with the address{" "}
            <code className="rounded bg-white px-1">{apiAddress}</code>. Keep it private: anyone holding it can send
            carers in and read their training for your company.
          </p>
        </NewKey>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

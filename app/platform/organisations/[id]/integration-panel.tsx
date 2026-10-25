"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { issueIntegrationKeyAction, revokeIntegrationKeyAction } from "./integration-actions";

/**
 * The organisation's rostering-integration key: whether it has one, when it
 * was issued and last used, and the controls to issue, replace or revoke it.
 * A new key is shown here once, with what to do with it.
 */
export function IntegrationPanel({
  orgId,
  orgName,
  hasKey,
  createdAt,
  lastUsedAt,
  origin,
}: {
  orgId: string;
  orgName: string;
  hasKey: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
  origin: string;
}) {
  const [pending, start] = useTransition();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function issue() {
    const ask = hasKey
      ? `Replace ${orgName}'s key? The current key stops working at once, so their portal disconnects until the new one is entered.`
      : `Issue an integration key for ${orgName}?`;
    if (!window.confirm(ask)) return;
    setError(null);
    start(async () => {
      const r = await issueIntegrationKeyAction(orgId);
      if (!r.ok || !r.key) return setError(r.error ?? "Could not issue a key.");
      setNewKey(r.key);
      setCopied(false);
    });
  }

  function revoke() {
    if (!window.confirm(`Revoke ${orgName}'s key? Their portal is disconnected at once.`)) return;
    setError(null);
    start(async () => {
      const r = await revokeIntegrationKeyAction(orgId);
      if (!r.ok) setError(r.error ?? "Could not revoke the key.");
      setNewKey(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div className="text-sm">
            {hasKey ? (
              <>
                <p className="font-medium">Key issued {createdAt ? formatDateTime(createdAt) : ""}</p>
                <p className="text-xs text-muted-foreground">
                  {lastUsedAt ? `Last used ${formatDateTime(lastUsedAt)}` : "Not used yet"}
                </p>
              </>
            ) : (
              <p className="font-medium">No key issued</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={issue} disabled={pending}>
            {hasKey ? "Replace key" : "Issue key"}
          </Button>
          {hasKey && (
            <Button size="sm" variant="outline" onClick={revoke} disabled={pending}>
              Revoke
            </Button>
          )}
        </div>
      </div>

      {newKey && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Copy this key now — it will not be shown again.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 text-xs">{newKey}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(newKey);
                setCopied(true);
              }}
            >
              <Copy className="size-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p>
            In {orgName}&apos;s myroster.care account, open the My Care Academy integration settings and
            enter this key, with the address <code className="rounded bg-white px-1">{origin}/api/portal</code>.
            Send it to them privately — anyone holding it can act for this organisation.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

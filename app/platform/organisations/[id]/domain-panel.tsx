"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { switchOffDomainAction, switchOnDomainAction } from "./domain-actions";

/** Switch a company's own address on or off, with what to do first. */
export function DomainPanel({
  orgId,
  domain,
  live,
  dnsOk,
}: {
  orgId: string;
  domain: string;
  live: boolean;
  dnsOk: boolean | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3 text-sm">
      <p>
        <span className="font-mono">{domain}</span> —{" "}
        {live ? "live." : dnsOk ? "their DNS record is in place, waiting to be switched on." : "waiting for their DNS record."}
      </p>
      {!live && (
        <p className="text-muted-foreground">
          First add <span className="font-mono">{domain}</span> to the Vercel project (Settings, Domains) and wait for its
          certificate. Then switch it on here: the record is checked again, and their managers are emailed.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {live ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Switch ${domain} off? Their staff go back to our address.`)) return;
              start(async () => {
                const r = await switchOffDomainAction(orgId);
                setError(r.ok ? null : (r.error ?? "Could not switch it off."));
              });
            }}
          >
            Switch off
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await switchOnDomainAction(orgId);
                setError(r.ok ? null : (r.error ?? "Could not switch it on."));
              })
            }
          >
            Check and switch on
          </Button>
        )}
      </div>
      {error && <p className="text-rose-600">{error}</p>}
    </div>
  );
}

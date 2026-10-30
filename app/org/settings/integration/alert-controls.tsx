"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALERT_EVENTS } from "@/lib/alert-signing";
import { addAlertEndpointAction, sendTestAlertAction, setAlertEndpointAction, type AlertState } from "./actions";

/** Add an address for alerts; the signing secret is shown once. */
export function AddAlertEndpoint() {
  const [state, add, adding] = useActionState<AlertState, FormData>(addAlertEndpointAction, {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <form action={add} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="alert-label">Which system</Label>
            <Input id="alert-label" name="label" placeholder="e.g. Birdie" maxLength={80} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="alert-url">The address it gave you</Label>
            <Input id="alert-url" name="url" type="url" placeholder="https://" required />
          </div>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Send it</legend>
          {ALERT_EVENTS.map((e) => (
            <label key={e.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={`event:${e.key}`} defaultChecked className="mt-1" />
              <span>
                {e.label}
                <span className="block text-xs text-muted-foreground">{e.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Button type="submit" size="sm" disabled={adding}>
          {adding ? "Saving…" : "Start sending alerts"}
        </Button>
      </form>
      {state.secret && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Give this secret to the system&apos;s developers. It won&apos;t be shown again.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 text-xs">{state.secret}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(state.secret!);
                setCopied(true);
              }}
            >
              <Copy className="size-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p>Every alert is signed with it, so their system can check each one came from us.</p>
        </div>
      )}
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
    </div>
  );
}

/** Send a test, pause or resume, or remove one address. */
export function AlertEndpointControls({ id, label, active }: { id: string; label: string; active: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>, done?: string) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      setNote(r.ok ? (done ?? null) : (r.error ?? "That didn't work."));
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending || !active} onClick={() => run(() => sendTestAlertAction(id), "Test alert received.")}>
        Send a test
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setAlertEndpointAction(id, active ? "pause" : "resume"))}>
        {active ? "Pause" : "Resume"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Stop sending alerts to ${label} and remove the address?`)) run(() => setAlertEndpointAction(id, "remove"));
        }}
      >
        Remove
      </Button>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

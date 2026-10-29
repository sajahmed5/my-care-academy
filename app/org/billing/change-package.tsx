"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestPackageChangeAction } from "./package-actions";

export interface PackageOption {
  value: string;
  label: string;
  price: number;
  points: string[];
}

/**
 * The packages side by side, theirs marked, and a way to ask for another
 * (29 Oct 2026). A request goes to us; nothing changes until we've been in
 * touch. `asked` is a request already open, so a manager who comes back sees
 * it was sent rather than wondering.
 */
export function ChangePackage({
  options,
  current,
  preselect,
  asked,
}: {
  options: PackageOption[];
  current: string;
  preselect: string | null;
  asked: { label: string; on: string } | null;
}) {
  const [chosen, setChosen] = useState<string | null>(preselect && preselect !== current ? preselect : null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosenLabel = options.find((o) => o.value === chosen)?.label ?? "";

  return (
    <div>
      {asked && !sent && (
        <p role="status" className="mb-4 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          You asked to move to <strong>{asked.label}</strong> on {asked.on}. We&apos;ll be in touch to set it up.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {options.map((o) => {
          const isCurrent = o.value === current;
          return (
            <div key={o.value} className="flex flex-col rounded-xl border p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{o.label}</h3>
                {isCurrent && (
                  <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                    Your package
                  </span>
                )}
              </div>
              <p className="mt-1 text-xl font-bold">
                £{o.price}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
              <ul className="mt-3 space-y-2 text-[13px]">
                {o.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-4">
                {isCurrent ? (
                  <p className="flex min-h-11 items-center justify-center text-sm text-muted-foreground">
                    You&apos;re on this package
                  </p>
                ) : (
                  <Button
                    className="w-full"
                    size="lg"
                    variant={chosen === o.value ? "default" : "outline"}
                    onClick={() => {
                      setChosen(o.value);
                      setSent(null);
                      setError(null);
                    }}
                  >
                    Ask to move to {o.label}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {chosen && !sent && (
        <div className="mt-5 rounded-xl border border-primary bg-accent/40 p-5">
          <h3 className="font-semibold">Ask to move to {chosenLabel}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ll get back to you within one working day to confirm the price and the date it starts.
          </p>
          <label htmlFor="package-note" className="mt-4 block text-sm font-medium">
            Anything we should know? (optional)
          </label>
          <textarea
            id="package-note"
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example, the date you'd like it to start"
            className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await requestPackageChangeAction(chosen, note);
                  if (r.ok) setSent(chosenLabel);
                  else setError(r.error ?? "Something went wrong.");
                })
              }
            >
              {pending ? "Sending…" : "Send request"}
            </Button>
            <Button size="lg" variant="outline" disabled={pending} onClick={() => setChosen(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {sent && (
        <div role="status" className="mt-5 flex gap-3 rounded-xl bg-accent p-5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-semibold">Request sent: move to {sent}</p>
            <p className="mt-1 text-sm text-accent-foreground">
              We&apos;ll be in touch within one working day to set it up.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

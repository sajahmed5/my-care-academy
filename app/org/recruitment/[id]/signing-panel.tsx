"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { sendForSigningAction } from "../signing-actions";

export interface SigningView { key: string; label: string; status: "none" | "sent" | "signed" | "countersigned"; done: boolean }

const STATUS: Record<SigningView["status"], string> = {
  none: "Not sent",
  sent: "Waiting for them to sign",
  signed: "Signed by them: your turn",
  countersigned: "Signed",
};

/**
 * Stage 4's documents to sign: send them (with the start date that goes into
 * the contract), see where each stands, and open each signed copy.
 */
export function SigningPanel({ candidateId, docs, hasEmail, address: onFile, manager }: { candidateId: string; docs: SigningView[]; hasEmail: boolean; address: string; manager: boolean }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [address, setAddress] = useState(onFile);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsent = docs.filter((d) => !d.done && (d.status === "none" || d.status === "sent"));

  const send = () =>
    start(async () => {
      setError(null);
      setMessage(null);
      const r = await sendForSigningAction(candidateId, startDate, address);
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else {
        setMessage(r.message ?? "Sent.");
        router.refresh();
      }
    });

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-medium">Documents to sign</span>
        {/* The wording is a setting: managers change it under Settings. */}
        {manager && <Link href="/org/settings/recruitment/documents" className="text-muted-foreground underline">The wording</Link>}
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {docs.map((d) => (
          <li key={d.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
            <span className="min-w-40 flex-1">{d.label}</span>
            <span className={d.status === "signed" ? "font-medium text-amber-800" : "text-muted-foreground"}>{d.done && d.status === "none" ? "Done on paper" : STATUS[d.status]}</span>
            {d.status !== "none" && (
              <Link href={`/org/recruitment/${candidateId}/signed/${d.key}`} className={buttonVariants({ size: "sm", variant: d.status === "signed" ? "default" : "outline" })}>
                {d.status === "signed" ? "Read and sign" : "Open"}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {unsent.length > 0 && hasEmail && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground">Their start date (it goes in the contract)</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 h-11 rounded-lg border bg-background px-3 text-sm sm:h-9" />
          </label>
          <label className="min-w-64 flex-1 text-sm">
            <span className="block text-xs text-muted-foreground">Their home address (it goes in the contract)</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm sm:h-9" />
          </label>
          <Button size="sm" disabled={pending || !startDate || !address.trim()} onClick={send}>
            {pending ? "Sending…" : unsent.some((d) => d.status === "sent") ? "Send again" : "Send to sign"}
          </Button>
        </div>
      )}
      {!hasEmail && <p className="text-muted-foreground">Add their email address to send these online, or do them on paper.</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {message && <p role="status" className="text-primary">{message}</p>}
    </div>
  );
}

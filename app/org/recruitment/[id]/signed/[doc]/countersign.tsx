"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/signature-pad";
import { countersignAction } from "../../../signing-actions";

const input = "mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** The company's half: sign the contract or refund agreement, or accept the role acceptance. */
export function Countersign({ candidateId, docKey, countersigned, defaultName }: { candidateId: string; docKey: string; countersigned: boolean; defaultName: string }) {
  const router = useRouter();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setError(null);
      const r = await countersignAction(candidateId, docKey, countersigned ? { dataUrl: dataUrl ?? "", signedName: name, signedTitle: title } : null);
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else router.push(`/org/recruitment/${candidateId}`);
    });

  return (
    <section aria-label="Your signature" className="rounded-2xl border border-primary bg-card p-5">
      <h2 className="font-semibold">{countersigned ? "Read it, then sign for the company" : "Read it, then accept it"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {countersigned ? "Your signature goes on their copy, and the step is confirmed." : "They sign this one alone. Accepting it confirms the step."}
      </p>
      {countersigned && (
        <div className="mt-3 space-y-3">
          <SignaturePad onChange={setDataUrl} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Your full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={input} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Your job title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={input} />
            </label>
          </div>
        </div>
      )}
      <Button className="mt-4" size="lg" disabled={pending || (countersigned && (!dataUrl || !name.trim()))} onClick={go}>
        {pending ? "Saving…" : countersigned ? "Sign for the company" : "Accept"}
      </Button>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}

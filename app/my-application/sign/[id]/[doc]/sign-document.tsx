"use client";

import { useState } from "react";
import Link from "next/link";
import { SignaturePad } from "@/components/signature-pad";
import { DocumentBody, SignatureLine } from "@/components/recruit/signed-document";
import { partDone, type PartState, type Snapshot } from "@/lib/signing-documents";
import { signPartAction } from "../../../actions";

/**
 * One part at a time: read it, then sign it (or, where the part allows,
 * choose not to). Each signature is saved as it's given.
 */
export function SignDocument({
  candidateId,
  docKey,
  company,
  fullName,
  snapshot,
  initialState,
  signed,
}: {
  candidateId: string;
  docKey: string;
  company: string;
  fullName: string;
  snapshot: Snapshot;
  initialState: Record<string, PartState>;
  signed: boolean;
}) {
  const [state, setState] = useState(initialState);
  const [finished, setFinished] = useState(signed);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [name, setName] = useState(fullName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The pad is drawn afresh for each part.
  const [padKey, setPadKey] = useState(0);

  const current = snapshot.parts.find((p) => !partDone(state[p.id])) ?? null;
  const index = current ? snapshot.parts.indexOf(current) : snapshot.parts.length;

  const sign = async (declined: boolean) => {
    if (!current) return;
    setBusy(true);
    setError(null);
    const r = await signPartAction(candidateId, docKey, current.id, declined ? { declined: true } : { dataUrl: dataUrl ?? "", signedName: name });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "That didn't save. Try again.");
      return;
    }
    setState((s) => ({ ...s, [current.id]: declined ? { declined: true, signedAt: new Date().toISOString() } : { dataUrl: dataUrl ?? undefined, signedName: name, signedAt: new Date().toISOString() } }));
    setDataUrl(null);
    setPadKey((k) => k + 1);
    if (r.done) setFinished(true);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-5">
      <Link href="/my-application" className="text-sm text-muted-foreground underline">Your application</Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{company}</p>
      <h1 className="mt-0.5 text-xl font-semibold">{snapshot.title}</h1>
      {snapshot.parts.length > 1 && !finished && (
        <p className="mt-1 text-sm text-muted-foreground">Part {Math.min(index + 1, snapshot.parts.length)} of {snapshot.parts.length}</p>
      )}

      {finished || !current ? (
        <div className="mt-5 space-y-4">
          <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
            Signed. Thank you. {snapshot.countersigned ? `${company || "The company"} will sign it too, and keep a copy on your file.` : `${company || "The company"} keeps a copy on your file.`}
          </p>
          {snapshot.parts.map((p) => (
            <details key={p.id} className="rounded-2xl border bg-card p-4">
              <summary className="cursor-pointer font-medium">{p.title}</summary>
              <div className="mt-3"><DocumentBody body={p.body} /></div>
              <div className="mt-3 border-t pt-3"><SignatureLine state={state[p.id]} declineLabel={p.declineLabel} /></div>
            </details>
          ))}
          <Link href="/my-application" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Back to your application</Link>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <section aria-label={current.title} className="rounded-2xl border bg-card p-5">
            {snapshot.parts.length > 1 && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{current.title}</p>}
            <div className="mt-2"><DocumentBody body={current.body} /></div>
          </section>
          <section aria-label="Your signature" className="space-y-3">
            <p className="text-sm font-medium">Sign here</p>
            <SignaturePad key={padKey} onChange={setDataUrl} />
            <label className="block text-sm">
              <span className="font-medium">Your full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
            </label>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busy || !dataUrl || !name.trim()} onClick={() => void sign(false)} className="min-h-11 flex-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {busy ? "Saving…" : "I agree: sign"}
              </button>
              {current.optional && (
                <button type="button" disabled={busy} onClick={() => void sign(true)} className="min-h-11 rounded-lg border px-4 text-sm font-semibold">
                  {current.declineLabel ?? "Don't sign this part"}
                </button>
              )}
            </div>
            {current.optional && <p className="text-xs text-muted-foreground">This part is your choice. Not signing it has no effect on your job.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

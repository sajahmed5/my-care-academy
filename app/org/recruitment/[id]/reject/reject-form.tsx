"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { REAPPLY_MONTHS, REJECTION_REASONS, buildRejection, rejectionProblems, type RejectionFields } from "@/lib/recruitment-letters";
import { sendRejectionAction } from "../../letter-actions";
import { LetterPreview } from "../letter-preview";

const input = "mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function RejectForm({
  candidateId,
  candidateName,
  companyName,
  position,
  email,
  initial,
  closed,
}: {
  candidateId: string;
  candidateName: string;
  companyName: string;
  position: string | null;
  email: string | null;
  initial: RejectionFields;
  closed: boolean;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<RejectionFields>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RejectionFields>(k: K, v: RejectionFields[K]) => setFields((f) => ({ ...f, [k]: v }));
  const toggle = (id: string) =>
    set("reasons", fields.reasons.includes(id) ? fields.reasons.filter((r) => r !== id) : [...fields.reasons, id]);

  const letter = buildRejection({ fields, candidateName, companyName, position, todayIso: new Date().toISOString().slice(0, 10) });
  const problems = rejectionProblems(fields);

  const close = (sendLetter: boolean) => {
    if (!window.confirm(sendLetter ? `Email this letter to ${email} and close their application?` : "Close their application without a letter?")) return;
    start(async () => {
      setError(null);
      const r = await sendRejectionAction(candidateId, fields, sendLetter);
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else router.push(`/org/recruitment/${candidateId}`);
    });
  };

  if (closed) {
    return <p className="rounded-xl bg-muted px-4 py-3 text-sm">Their application is already closed.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <fieldset className="rounded-2xl border bg-card p-4">
          <legend className="px-1 text-sm font-medium">Why (tick any that apply)</legend>
          <p className="text-xs text-muted-foreground">
            Each one adds a kind, plain sentence to the letter. There&apos;s deliberately nothing about health, age, family, religion or
            nationality, and nothing that says what a DBS or a referee said.
          </p>
          <div className="mt-3 space-y-2">
            {REJECTION_REASONS.map((r) => (
              <label key={r.id} className="flex gap-2.5 text-sm">
                <input type="checkbox" checked={fields.reasons.includes(r.id)} onChange={() => toggle(r.id)} className="mt-0.5 size-4 shrink-0" />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm">
          <span className="font-medium">Anything else, in your words (optional)</span>
          <input value={fields.note} onChange={(e) => set("note", e.target.value)} maxLength={600} className={input} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">May they apply again?</span>
          <select value={fields.reapplyMonths} onChange={(e) => set("reapplyMonths", Number(e.target.value))} className={input}>
            {REAPPLY_MONTHS.map((m) => (
              <option key={m} value={m}>{m === 0 ? "Don't say" : `Yes, in ${m} months`}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">From</span>
            <input value={fields.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} maxLength={80} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Their job title</span>
            <input value={fields.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} maxLength={80} className={input} />
          </label>
        </div>
        <div className="space-y-2 border-t pt-4">
          {email && problems.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          {!email && <p className="text-sm text-muted-foreground">There&apos;s no email address for them, so this can only be closed without a letter.</p>}
          <div className="flex flex-wrap gap-3">
            <Button size="lg" disabled={!email || problems.length > 0 || pending} onClick={() => close(true)}>
              {pending ? "Working…" : "Send the letter and close"}
            </Button>
            <Button size="lg" variant="outline" disabled={pending} onClick={() => close(false)}>
              Close without a letter
            </Button>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What they&apos;ll receive</p>
        <LetterPreview letter={letter} />
      </div>
    </div>
  );
}

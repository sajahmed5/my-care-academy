"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_HOURS_LINE, buildOffer, offerProblems, type OfferFields } from "@/lib/recruitment-letters";
import { draftWhyHiredAction, saveLetterDraftAction, sendOfferAction } from "../../letter-actions";
import { LetterPreview } from "../letter-preview";

const input = "mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function OfferForm({
  candidateId,
  candidateName,
  companyName,
  email,
  initial,
  conditions,
  referees,
  sent,
  blocked,
  unsuccessful,
  ai,
}: {
  candidateId: string;
  candidateName: string;
  companyName: string;
  email: string | null;
  initial: OfferFields;
  conditions: string[];
  referees: number;
  sent: string | null;
  blocked: string | null;
  unsuccessful: boolean;
  ai: { allowed: boolean; reason: string | null };
}) {
  const router = useRouter();
  const [fields, setFields] = useState<OfferFields>(initial);
  const [pending, start] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (k: keyof OfferFields, v: string) => {
    const next = { ...fields, [k]: v };
    setFields(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveLetterDraftAction(candidateId, "offer", next), 1500);
  };

  const letter = buildOffer({ fields, candidateName, companyName, referees, todayIso: new Date().toISOString().slice(0, 10), conditions });
  const problems = offerProblems(fields);

  const draft = async () => {
    if (fields.whyHired.trim() && !window.confirm("Replace what's written with a new draft?")) return;
    setDrafting(true);
    setError(null);
    const r = await draftWhyHiredAction(candidateId, fields.position);
    setDrafting(false);
    if (r.ok) set("whyHired", r.text);
    else setError(r.error);
  };

  const send = () => {
    if (!window.confirm(`Email this offer to ${email}?`)) return;
    start(async () => {
      setError(null);
      const r = await sendOfferAction(candidateId, fields);
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else {
        setMessage(r.message ?? "Sent.");
        router.push(`/org/recruitment/${candidateId}`);
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        {sent && <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">{sent} Sending again replaces it.</p>}
        {unsuccessful && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">The interview record says Unsuccessful. Check that before sending an offer.</p>
        )}
        <label className="block text-sm">
          <span className="font-medium">Position</span>
          <input value={fields.position} onChange={(e) => set("position", e.target.value)} maxLength={80} className={input} />
        </label>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="why" className="text-sm font-medium">Why we chose you</label>
            <Button type="button" variant="outline" size="sm" disabled={!ai.allowed || drafting} onClick={draft} title={ai.reason ?? undefined}>
              <Sparkles className="size-4" aria-hidden="true" /> {drafting ? "Drafting…" : "Draft with AI"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {ai.allowed
              ? "Drafted from the interview's values notes and their application. Read it and change anything that isn't right: you send it, not the AI."
              : ai.reason}
          </p>
          <textarea
            id="why"
            value={fields.whyHired}
            onChange={(e) => set("whyHired", e.target.value)}
            rows={10}
            maxLength={3000}
            placeholder="Two or three short paragraphs on what you saw in them: the real examples they gave and the values they showed. Leave a blank line between paragraphs."
            className="mt-2 w-full rounded-lg border bg-background p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <label className="block text-sm">
          <span className="font-medium">Hours</span>
          <input value={fields.hoursLine} onChange={(e) => set("hoursLine", e.target.value)} placeholder={DEFAULT_HOURS_LINE} maxLength={500} className={input} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Pay</span>
          <input value={fields.payLine} onChange={(e) => set("payLine", e.target.value)} placeholder="For example: Your pay will be £12.60 an hour." maxLength={300} className={input} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Signed by</span>
            <input value={fields.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} maxLength={80} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Their job title</span>
            <input value={fields.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} maxLength={80} className={input} />
          </label>
        </div>

        <div className="space-y-2 border-t pt-4">
          {blocked ? (
            <p className="text-sm text-muted-foreground">{blocked}</p>
          ) : !email ? (
            <p className="text-sm text-muted-foreground">There&apos;s no email address for them. Add one on their page, or send it on paper and mark the step held on paper.</p>
          ) : problems.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              It goes to {email}, from {companyName || "your company"}. Sending confirms the offer step and opens stage 3.
            </p>
          )}
          <Button size="lg" disabled={!!blocked || !email || problems.length > 0 || pending} onClick={send}>
            {pending ? "Sending…" : sent ? "Send again" : "Send the offer"}
          </Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {message && <p role="status" className="text-sm text-primary">{message}</p>}
        </div>
      </div>
      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What they&apos;ll receive</p>
        <LetterPreview letter={letter} />
      </div>
    </div>
  );
}

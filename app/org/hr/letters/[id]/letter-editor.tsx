"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { textareaClass } from "@/components/hr/fields";
import { discardLetterAction, draftLetterWithAiAction, saveLetterAction, sendLetterAction } from "../actions";

/**
 * The draft: subject and body to edit, the paragraphs that can't be taken out
 * (ACAS) shown beneath, an optional AI redraft from the manager's notes, and
 * Send. A person always reads it before it goes.
 */
export function LetterEditor({
  id,
  to,
  greeting,
  subject: initialSubject,
  body: initialBody,
  fixed,
  signer,
  ai,
  backHref,
}: {
  id: string;
  to: string | null;
  greeting: string;
  subject: string;
  body: string;
  fixed: string[];
  signer: string;
  /** Why AI can't be used, or null when it can. */
  ai: string | null;
  backHref: string;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) => start(async () => { setMessage(null); await fn(); });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="l-subject" className="text-sm font-medium">Subject</label>
        <Input id="l-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="l-body" className="text-sm font-medium">The letter</label>
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <textarea id="l-body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} className={`${textareaClass} leading-relaxed`} />
        <p className="text-xs text-muted-foreground">A blank line starts a new paragraph. Anything still in {"{{double brackets}}"} must be filled in before it can be sent.</p>
      </div>
      {fixed.length > 0 && (
        <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Always included, and can&apos;t be taken out</p>
          {fixed.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">Yours sincerely, {signer}</p>

      <details className="rounded-xl border p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4" aria-hidden /> Draft it with AI
        </summary>
        {ai ? (
          <p className="mt-2 text-sm text-muted-foreground">{ai}</p>
        ) : (
          <div className="mt-3 space-y-2">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={textareaClass} placeholder="What should it say? Facts only: dates, what happened, what was agreed." />
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await draftLetterWithAiAction(id, notes);
                  if (!r.ok) return setMessage(r.error ?? "That didn't work.");
                  setSubject(r.subject ?? subject);
                  setBody(r.body ?? body);
                  setMessage("Drafted. Read it through and change anything before you send it.");
                })
              }
            >
              Redraft the letter
            </Button>
            <p className="text-xs text-muted-foreground">Charged to your company&apos;s AI use. AI never sends anything.</p>
          </div>
        )}
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={pending || !to}
          onClick={() => {
            if (!window.confirm(`Email this letter to ${to}? A PDF copy is kept on their file.`)) return;
            run(async () => {
              const r = await sendLetterAction(id, subject, body);
              if (!r.ok) return setMessage(r.error ?? "It wasn't sent.");
              router.push(backHref);
              router.refresh();
            });
          }}
        >
          Send to {to ?? "them"}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(async () => { const r = await saveLetterAction(id, subject, body); setMessage(r.ok ? "Saved." : r.error ?? "That didn't save."); })}
        >
          Save the draft
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Throw this draft away?")) return;
            run(async () => {
              const r = await discardLetterAction(id);
              if (!r.ok) return setMessage(r.error ?? "It wasn't removed.");
              router.push(backHref);
            });
          }}
        >
          Discard
        </Button>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
      {!to && <p className="text-sm text-destructive">They have no email address on their login, so it can&apos;t be emailed.</p>}
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { textareaClass } from "@/components/hr/fields";
import { SignaturePad } from "@/app/org/forms/[id]/fill/signature-pad";
import { loadStatementAction, submitStatementAction } from "./actions";

export function StatementForm({ token }: { token: string }) {
  const [state, setState] = useState<{ ok: boolean; error?: string; company?: string; name?: string; done?: boolean } | null>(null);
  const [statement, setStatement] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    loadStatementAction(token).then(setState);
  }, [token]);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-10">
      {!state ? (
        <p className="text-sm text-muted-foreground">Opening…</p>
      ) : !state.ok ? (
        <p className="text-sm">{state.error}</p>
      ) : sent || state.done ? (
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Thank you</h1>
          <p className="text-sm text-muted-foreground">Your statement has been sent to {state.company}. You can close this page.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-muted-foreground">{state.company}</p>
            <h1 className="text-xl font-semibold">Your witness statement</h1>
            <p className="text-sm text-muted-foreground">
              Hello {state.name}. Please write what you saw or heard, in your own words: what happened, when and where, who was there, and anything said. Stick to what you know yourself. It&apos;s kept confidential to the people dealing with the matter.
            </p>
          </div>
          <textarea rows={14} className={textareaClass} value={statement} onChange={(e) => setStatement(e.target.value)} aria-label="Your statement" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Sign to say it is true to the best of your knowledge</p>
            <SignaturePad onChange={setSignature} />
            <Input value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder="Type your full name" aria-label="Your name" />
          </div>
          <div className="flex items-center gap-3">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await submitStatementAction(token, { statement, signature: signature ?? "", signedName });
                  if (!r.ok) return setMessage(r.error ?? "It didn't send.");
                  setSent(true);
                })
              }
            >
              Send my statement
            </Button>
            {message && <span role="status" className="text-sm text-destructive">{message}</span>}
          </div>
        </>
      )}
    </main>
  );
}

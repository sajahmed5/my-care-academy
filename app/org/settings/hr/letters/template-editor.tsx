"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { textareaClass } from "@/components/hr/fields";
import { saveLetterTemplateAction } from "../actions";

export function TemplateEditor({
  kind,
  label,
  ours,
  own,
  fixed,
}: {
  kind: string;
  label: string;
  ours: { subject: string; body: string };
  own: { subject?: string; body?: string } | null;
  fixed: string[];
}) {
  const [subject, setSubject] = useState(own?.subject ?? ours.subject);
  const [body, setBody] = useState(own?.body ?? ours.body);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (s: string, b: string) =>
    start(async () => {
      const r = await saveLetterTemplateAction(kind, s, b);
      setMessage(r.ok ? "Saved." : r.error ?? "That didn't save.");
    });
  return (
    <details className="rounded-2xl border bg-card p-4">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-medium">
        {label}
        {own && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">Your wording</span>}
      </summary>
      <div className="mt-3 space-y-3">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} aria-label={`${label}: subject`} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className={textareaClass} aria-label={`${label}: letter`} />
        {fixed.length > 0 && (
          <div className="space-y-1 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <p className="text-xs font-semibold uppercase tracking-wide">Always added after your wording (ACAS)</p>
            {fixed.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={pending} onClick={() => save(subject, body)}>Save</Button>
          {own && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setSubject(ours.subject);
                setBody(ours.body);
                save("", "");
              }}
            >
              Go back to ours
            </Button>
          )}
          {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
        </div>
      </div>
    </details>
  );
}

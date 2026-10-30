"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { blanksIn } from "@/lib/signing-documents";
import { saveWordingAction } from "@/app/org/recruitment/signing-actions";

interface PartView { id: string; title: string; body: string; ours: string; version: number; optional: boolean }
interface DocView { key: string; title: string; countersigned: boolean; parts: PartView[] }

function PartEditor({ docKey, part, canEdit }: { docKey: string; part: PartView; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(part.body);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blanks = blanksIn(text);
  const changed = text.trim() !== part.body.trim();

  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveWordingAction(docKey, part.id, text);
      if (!r.ok) setError(r.error ?? "That didn't save.");
      else {
        setMessage(r.message ?? "Saved.");
        router.refresh();
      }
    });

  return (
    <li className="border-t px-5 py-3.5 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[1_1_16rem]">
          <p className="font-medium">
            {part.title}
            {part.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">Their choice to sign</span>}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {part.version ? `Your wording, version ${part.version}` : "Our template"}
            {blanksIn(part.body).length > 0 && ` · ${blanksIn(part.body).length} blank${blanksIn(part.body).length === 1 ? "" : "s"} to fill in`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>{open ? "Close" : canEdit ? "Edit" : "Read"}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setMessage(null); }}
            readOnly={!canEdit}
            rows={18}
            aria-label={`Wording for ${part.title}`}
            className="w-full rounded-lg border bg-background p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          {blanks.length > 0 && (
            <p className="text-sm text-amber-900">Still to fill in: {blanks.join(", ")}</p>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" disabled={pending || !changed} onClick={save}>{pending ? "Saving…" : "Save as a new version"}</Button>
              {text.trim() !== part.ours.trim() && (
                <Button variant="ghost" size="sm" onClick={() => setText(part.ours)}>Start again from our template</Button>
              )}
              {message && <span role="status" className="text-sm text-primary">{message}</span>}
              {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function WordingEditor({ docs, canEdit }: { docs: DocView[]; canEdit: boolean }) {
  return (
    <div className="space-y-4">
      {!canEdit && <p className="rounded-xl bg-muted px-4 py-3 text-sm">Only a manager can change the wording.</p>}
      {docs.map((d) => (
        <section key={d.key} aria-labelledby={`doc-${d.key}`} className="overflow-hidden rounded-2xl border bg-card">
          <div className="px-5 py-4">
            <h2 id={`doc-${d.key}`} className="font-semibold">{d.title}</h2>
            <p className="text-sm text-muted-foreground">{d.countersigned ? "Signed by them, then by you." : "Signed by them; you accept it."}</p>
          </div>
          <ul className="border-t">
            {d.parts.map((p) => <PartEditor key={p.id} docKey={d.key} part={p} canEdit={canEdit} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

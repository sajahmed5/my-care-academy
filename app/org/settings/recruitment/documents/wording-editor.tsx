"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FIELD_TAGS, blanksIn, fillKnownBlanks, parseBody } from "@/lib/signing-documents";
import { saveWordingAction } from "@/app/org/recruitment/signing-actions";

interface PartView { id: string; title: string; body: string; ours: string; version: number; optional: boolean }
interface DocView { key: string; title: string; countersigned: boolean; parts: PartView[] }

/** A {{merge field}} or a [blank], as the preview shows them. */
const TOKEN = /(\{\{\s*[a-zA-Z]+\s*\}\}|\[[^[\]\n]{2,240}\])/g;

/**
 * One line of wording as it will read (issue #85): the company's name filled
 * in, a candidate's details as a grey tag, and every [blank] in amber.
 */
function Inline({ text, companyName }: { text: string; companyName: string }) {
  return (
    <>
      {text.split(TOKEN).map((piece, i) => {
        const field = /^\{\{\s*([a-zA-Z]+)\s*\}\}$/.exec(piece)?.[1];
        if (field === "companyName") return <strong key={i} title="Filled in for you">{companyName}</strong>;
        if (field)
          return (
            <span key={i} title="Filled in from their record when you send" className="rounded bg-muted px-1.5 py-0.5 text-[13px] text-muted-foreground">
              {FIELD_TAGS[field] ?? field}
            </span>
          );
        if (/^\[.*\]$/.test(piece))
          return (
            <mark key={i} title="Still to fill in" className="rounded bg-amber-200 px-1 text-amber-950">
              {piece}
            </mark>
          );
        return <span key={i}>{piece}</span>;
      })}
    </>
  );
}

function Preview({ text, companyName }: { text: string; companyName: string }) {
  return (
    <div className="space-y-2.5 rounded-lg border bg-background p-4 text-sm leading-relaxed">
      {parseBody(text).map((b, i): ReactNode =>
        b.type === "heading" ? (
          <h4 key={i} className="pt-1 font-semibold"><Inline text={b.text} companyName={companyName} /></h4>
        ) : b.type === "list" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => <li key={j}><Inline text={it} companyName={companyName} /></li>)}
          </ul>
        ) : (
          <p key={i}><Inline text={b.text} companyName={companyName} /></p>
        ),
      )}
    </div>
  );
}

function PartEditor({ docKey, part, canEdit, companyName, known }: { docKey: string; part: PartView; canEdit: boolean; companyName: string; known: Record<string, string> }) {
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(part.body);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blanks = blanksIn(text);
  const fillable = blanks.filter((b) => known[b]);
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

  /** Select the next [blank] after the cursor, so typing replaces it (once the edit box is showing). */
  const [jump, setJump] = useState(0);
  const nextBlank = () => { setEditing(true); setJump((n) => n + 1); };
  useEffect(() => {
    const el = box.current;
    if (!jump || !el) return;
    const from = el.selectionEnd;
    const all = [...el.value.matchAll(/\[[^[\]\n]{2,240}\]/g)];
    const m = all.find((x) => (x.index ?? 0) >= from) ?? all[0];
    if (!m) return;
    el.focus();
    el.setSelectionRange(m.index ?? 0, (m.index ?? 0) + m[0].length);
    // Bring it into view: the blank's line near the top of the box (20px lines).
    el.scrollTop = Math.max(0, (el.value.slice(0, m.index).split("\n").length - 3) * 20);
  }, [jump]);

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
            {blanksIn(part.body).length > 0 && (
              <span className="text-amber-900"> · {blanksIn(part.body).length} blank{blanksIn(part.body).length === 1 ? "" : "s"} to fill in</span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>{open ? "Close" : canEdit ? "Open" : "Read"}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" className="inline-flex rounded-lg border p-0.5 text-sm">
                <button type="button" role="tab" aria-selected={!editing} onClick={() => setEditing(false)} className={`rounded-md px-3 py-1 ${!editing ? "bg-muted font-medium" : "text-muted-foreground"}`}>
                  How it reads
                </button>
                <button type="button" role="tab" aria-selected={editing} onClick={() => setEditing(true)} className={`rounded-md px-3 py-1 ${editing ? "bg-muted font-medium" : "text-muted-foreground"}`}>
                  Edit the wording
                </button>
              </div>
              {blanks.length > 0 && <Button variant="outline" size="sm" onClick={nextBlank}>Next blank</Button>}
              {fillable.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => { setText(fillKnownBlanks(text, known)); setMessage(null); }}>
                  Fill in from your settings ({fillable.length})
                </Button>
              )}
            </div>
          )}
          {editing && canEdit ? (
            <textarea
              ref={box}
              value={text}
              onChange={(e) => { setText(e.target.value); setMessage(null); }}
              rows={18}
              aria-label={`Wording for ${part.title}`}
              className="w-full rounded-lg border bg-background p-3 font-mono text-[13px] leading-[20px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          ) : (
            <Preview text={text} companyName={companyName} />
          )}
          {blanks.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="font-medium">Still to fill in</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {blanks.map((b) => (
                  <li key={b}>
                    {b}
                    {known[b] && <span className="text-amber-900/80"> · from your settings: {known[b]}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" disabled={pending || !changed} onClick={save}>{pending ? "Saving…" : "Save as a new version"}</Button>
              {text.trim() !== part.ours.trim() && (
                <Button variant="ghost" size="sm" onClick={() => setText(part.ours)}>Start again from our template</Button>
              )}
              {changed && !message && <span className="text-sm text-muted-foreground">Not saved yet.</span>}
              {message && <span role="status" className="text-sm text-primary">{message}</span>}
              {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function WordingEditor({ docs, canEdit, companyName, known }: { docs: DocView[]; canEdit: boolean; companyName: string; known: Record<string, string> }) {
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
            {d.parts.map((p) => <PartEditor key={p.id} docKey={d.key} part={p} canEdit={canEdit} companyName={companyName} known={known} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CUSTOM_TYPES, MAX_CUSTOM, newQuestionId, type CustomQuestion, type CustomType } from "@/lib/custom-questions";
import { saveCustomQuestionsAction, saveInterviewHiddenAction } from "@/app/org/recruitment/editing-actions";

const input = "mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "That didn't save." });
      if (r.ok) router.refresh();
    });
  return { pending, message, run, clear: () => setMessage(null) };
}

export function SaveLine({ pending, message, onSave, canEdit }: { pending: boolean; message: { ok: boolean; text: string } | null; onSave: () => void; canEdit: boolean }) {
  if (!canEdit) return null;
  return (
    <div className="flex items-center gap-3">
      <Button size="sm" disabled={pending} onClick={onSave}>{pending ? "Saving…" : "Save"}</Button>
      {message && <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-primary" : "text-destructive"}`}>{message.text}</span>}
    </div>
  );
}

export { useSave };

/** A company's own questions on one form: add, change, take out. */
export function QuestionsEditor({ form, initial, canEdit }: { form: string; initial: CustomQuestion[]; canEdit: boolean }) {
  const [list, setList] = useState<CustomQuestion[]>(initial.filter((q) => !q.retired));
  const { pending, message, run, clear } = useSave();
  const set = (i: number, patch: Partial<CustomQuestion>) => { clear(); setList((l) => l.map((q, j) => (j === i ? { ...q, ...patch } : q))); };

  return (
    <div className="space-y-3">
      {list.length === 0 && <p className="text-sm text-muted-foreground">None yet: the form has our questions only.</p>}
      {list.map((q, i) => (
        <div key={q.id} className="space-y-2 rounded-xl border p-3">
          <div className="flex items-start gap-2">
            <label className="flex-1 text-sm">
              <span className="text-xs text-muted-foreground">Question {i + 1}</span>
              <input value={q.label} onChange={(e) => set(i, { label: e.target.value })} disabled={!canEdit} maxLength={300} className={input} />
            </label>
            {canEdit && (
              <Button variant="ghost" size="icon" aria-label={`Take out question ${i + 1}`} onClick={() => { clear(); setList((l) => l.filter((_, j) => j !== i)); }} className="mt-5">
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="text-sm">
              <span className="text-xs text-muted-foreground">Answered with</span>
              <select value={q.type} onChange={(e) => set(i, { type: e.target.value as CustomType })} disabled={!canEdit} className={input}>
                {CUSTOM_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={q.required} onChange={(e) => set(i, { required: e.target.checked })} disabled={!canEdit} className="size-4" />
              Must be answered
            </label>
          </div>
          {q.type === "select" && (
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">The choices, one on each line (at least two)</span>
              <textarea
                value={(q.options ?? []).join("\n")}
                onChange={(e) => set(i, { options: e.target.value.split("\n") })}
                disabled={!canEdit}
                rows={3}
                className="mt-1 w-full rounded-lg border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Help under the question (optional)</span>
            <input value={q.help ?? ""} onChange={(e) => set(i, { help: e.target.value })} disabled={!canEdit} maxLength={300} className={input} />
          </label>
        </div>
      ))}
      {canEdit && list.length < MAX_CUSTOM && (
        <Button variant="outline" size="sm" onClick={() => { clear(); setList((l) => [...l, { id: newQuestionId(), label: "", type: "longtext", required: false }]); }}>
          <Plus className="size-4" aria-hidden="true" /> Add a question
        </Button>
      )}
      <SaveLine canEdit={canEdit} pending={pending} message={message} onSave={() => run(() => saveCustomQuestionsAction(form, list.map((q) => ({ ...q, options: q.options?.map((o) => o.trim()).filter(Boolean) }))))} />
      {canEdit && <p className="text-xs text-muted-foreground">A question you take out stays on records that already answer it.</p>}
    </div>
  );
}

/** Our general interview questions: which this company asks. The values questions always stay. */
export function InterviewQuestionsPicker({ questions, hidden: initial, canEdit }: { questions: { id: string; text: string }[]; hidden: string[]; canEdit: boolean }) {
  const [hidden, setHidden] = useState<string[]>(initial);
  const { pending, message, run, clear } = useSave();
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {questions.map((q) => (
          <li key={q.id}>
            <label className="flex gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={!hidden.includes(q.id)}
                disabled={!canEdit}
                onChange={(e) => { clear(); setHidden((h) => (e.target.checked ? h.filter((x) => x !== q.id) : [...h, q.id])); }}
                className="mt-0.5 size-4 shrink-0"
              />
              {q.text}
            </label>
          </li>
        ))}
      </ul>
      <SaveLine canEdit={canEdit} pending={pending} message={message} onSave={() => run(() => saveInterviewHiddenAction(hidden))} />
    </div>
  );
}

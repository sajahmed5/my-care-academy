"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
// The same shapes as lib/literacy-test's, written out here: that file holds
// the answer key, and browser code never imports it (tests/literacy-test.test.ts).
interface OwnQuestion { id: string; prompt: string; options: string[]; answer: string }
interface LiteracySettings { minutes: number; passPercent: number; off: string[]; own: OwnQuestion[] }
import { saveLiteracySettingsAction } from "../editing-actions";
import { SaveLine, useSave } from "./questions-editor";

const input = "mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const newId = () => `own_${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;

/**
 * The literacy test: the time allowed, the pass mark, which of our questions
 * it uses, and the company's own (tap one answer, so marking stays automatic).
 * A candidate's test is fixed when it's unlocked: changes here apply to the
 * next one unlocked.
 */
export function TestEditor({ initial, ours, minMarks, canEdit }: { initial: LiteracySettings; ours: { id: string; prompt: string; marks: number; type: string }[]; minMarks: number; canEdit: boolean }) {
  const [s, setS] = useState<LiteracySettings>(initial);
  const { pending, message, run, clear } = useSave();
  const set = (patch: Partial<LiteracySettings>) => { clear(); setS((x) => ({ ...x, ...patch })); };
  const setOwn = (i: number, patch: Partial<OwnQuestion>) => set({ own: s.own.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const marks = ours.filter((q) => !s.off.includes(q.id)).reduce((n, q) => n + q.marks, 0) + s.own.length;

  return (
    <div className="space-y-4">
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium">Time allowed (minutes)</span>
          <input type="number" min={5} max={60} value={s.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} disabled={!canEdit} className={input} />
        </label>
        <label className="text-sm">
          <span className="font-medium">Pass mark (%)</span>
          <input type="number" min={30} max={100} value={s.passPercent} onChange={(e) => set({ passPercent: Number(e.target.value) })} disabled={!canEdit} className={input} />
        </label>
      </div>
      <p className={`text-sm ${marks < minMarks ? "text-destructive" : "text-muted-foreground"}`}>
        {marks} marks in all{marks < minMarks ? `: it needs at least ${minMarks}.` : "."}
      </p>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium">Our questions</legend>
        {ours.map((q) => (
          <label key={q.id} className="flex gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={!s.off.includes(q.id)}
              disabled={!canEdit}
              onChange={(e) => set({ off: e.target.checked ? s.off.filter((x) => x !== q.id) : [...s.off, q.id] })}
              className="mt-0.5 size-4 shrink-0"
            />
            <span>{q.prompt} <span className="text-muted-foreground">({q.marks} mark{q.marks === 1 ? "" : "s"})</span></span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-3">
        <p className="text-sm font-medium">Your own questions <span className="font-normal text-muted-foreground">(tap one answer, one mark each)</span></p>
        {s.own.map((q, i) => (
          <div key={q.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex items-start gap-2">
              <label className="flex-1 text-sm">
                <span className="text-xs text-muted-foreground">Question</span>
                <input value={q.prompt} onChange={(e) => setOwn(i, { prompt: e.target.value })} disabled={!canEdit} maxLength={400} className={input} />
              </label>
              {canEdit && (
                <Button variant="ghost" size="icon" aria-label={`Take out your question ${i + 1}`} className="mt-5" onClick={() => set({ own: s.own.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">The answers to choose from, one on each line</span>
              <textarea value={q.options.join("\n")} onChange={(e) => setOwn(i, { options: e.target.value.split("\n") })} disabled={!canEdit} rows={4} className="mt-1 w-full rounded-lg border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">The right answer</span>
              <select value={q.answer} onChange={(e) => setOwn(i, { answer: e.target.value })} disabled={!canEdit} className={input}>
                <option value="">Choose…</option>
                {q.options.map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>
        ))}
        {canEdit && s.own.length < 20 && (
          <Button variant="outline" size="sm" onClick={() => set({ own: [...s.own, { id: newId(), prompt: "", options: [], answer: "" }] })}>
            <Plus className="size-4" aria-hidden="true" /> Add a question
          </Button>
        )}
      </div>
      <SaveLine
        canEdit={canEdit}
        pending={pending}
        message={message}
        onSave={() => run(() => saveLiteracySettingsAction({ ...s, own: s.own.map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) })) }))}
      />
      {canEdit && <p className="text-xs text-muted-foreground">A question without a right answer, or with fewer than two choices, isn&apos;t saved. Changes apply to tests unlocked from now on.</p>}
    </div>
  );
}

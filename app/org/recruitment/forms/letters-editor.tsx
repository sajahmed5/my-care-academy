"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LetterSettings, RejectionReason } from "@/lib/recruitment-letters";
import { saveLetterSettingsAction } from "../editing-actions";
import { SaveLine, useSave } from "./questions-editor";

const input = "mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const newId = () => `own_${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;

/** The rejection reasons the office ticks from, and what an offer is conditional on. */
export function LettersEditor({ initial, ours, defaultConditions, canEdit }: { initial: LetterSettings; ours: RejectionReason[]; defaultConditions: string[]; canEdit: boolean }) {
  const [s, setS] = useState<LetterSettings>(initial);
  const [conditions, setConditions] = useState(initial.conditions.join("\n"));
  const { pending, message, run, clear } = useSave();
  const set = (patch: Partial<LetterSettings>) => { clear(); setS((x) => ({ ...x, ...patch })); };
  const setOwn = (i: number, patch: Partial<RejectionReason>) => set({ ownReasons: s.ownReasons.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-5">
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium">Rejection reasons the office can tick</legend>
        {ours.map((r) => (
          <label key={r.id} className="flex gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={!s.reasonsOff.includes(r.id)}
              disabled={!canEdit}
              onChange={(e) => set({ reasonsOff: e.target.checked ? s.reasonsOff.filter((x) => x !== r.id) : [...s.reasonsOff, r.id] })}
              className="mt-0.5 size-4 shrink-0"
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <div className="space-y-3">
        <p className="text-sm font-medium">Your own reasons</p>
        <p className="text-xs text-muted-foreground">
          Never a reason about health, age, family, religion, nationality or any other personal characteristic, and never what a DBS or a
          referee said.
        </p>
        {s.ownReasons.map((r, i) => (
          <div key={r.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex items-start gap-2">
              <label className="flex-1 text-sm">
                <span className="text-xs text-muted-foreground">What the office ticks</span>
                <input value={r.label} onChange={(e) => setOwn(i, { label: e.target.value })} disabled={!canEdit} maxLength={120} className={input} />
              </label>
              {canEdit && (
                <Button variant="ghost" size="icon" aria-label={`Take out your reason ${i + 1}`} className="mt-5" onClick={() => set({ ownReasons: s.ownReasons.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">What the candidate reads</span>
              <input value={r.sentence} onChange={(e) => setOwn(i, { sentence: e.target.value })} disabled={!canEdit} maxLength={400} className={input} />
            </label>
          </div>
        ))}
        {canEdit && s.ownReasons.length < 20 && (
          <Button variant="outline" size="sm" onClick={() => set({ ownReasons: [...s.ownReasons, { id: newId(), label: "", sentence: "" }] })}>
            <Plus className="size-4" aria-hidden="true" /> Add a reason
          </Button>
        )}
      </div>
      <label className="block text-sm">
        <span className="font-medium">An offer is conditional on…</span>
        <span className="block text-xs text-muted-foreground">One on each line. Leave it empty to use ours, shown greyed out.</span>
        <textarea
          value={conditions}
          onChange={(e) => { clear(); setConditions(e.target.value); }}
          disabled={!canEdit}
          rows={6}
          placeholder={defaultConditions.join("\n")}
          className="mt-1 w-full rounded-lg border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </label>
      <SaveLine
        canEdit={canEdit}
        pending={pending}
        message={message}
        onSave={() => run(() => saveLetterSettingsAction({ ...s, conditions: conditions.split("\n").map((c) => c.trim()).filter(Boolean) }))}
      />
    </div>
  );
}

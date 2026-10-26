"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMonths } from "@/lib/records";
import { AUDIT_KINDS, auditScore, type AuditAnswer } from "@/lib/audits";
import type { SaveState } from "@/app/platform/actions";
import { saveAuditAction } from "./actions";

const selectClass = "flex h-8 rounded-lg border border-input bg-background px-2 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const ANSWERS: { value: AuditAnswer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "N/A" },
];

/** Carry out an audit: the checklist, and an owner for anything that fails. */
export function RunAudit({ staff, initialKind }: { staff: { id: string; name: string }[]; initialKind?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [kindKey, setKindKey] = useState(initialKind ?? AUDIT_KINDS[0].key);
  const kind = AUDIT_KINDS.find((k) => k.key === kindKey) ?? AUDIT_KINDS[0];
  const [answers, setAnswers] = useState<Record<string, AuditAnswer>>({});
  const [heldOn, setHeldOn] = useState(today);
  const [nextDue, setNextDue] = useState(addMonths(today, kind.intervalMonths));
  const [state, action, pending] = useActionState<SaveState, FormData>(saveAuditAction, {});
  const score = auditScore(answers);
  const answered = kind.questions.filter((q) => answers[q.id]).length;

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="space-y-4">
          <input type="hidden" name="kind" value={kind.key} />
          <div className="flex flex-wrap gap-2">
            {AUDIT_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => {
                  setKindKey(k.key);
                  setAnswers({});
                  setNextDue(addMonths(heldOn, k.intervalMonths));
                }}
                className={`rounded-full border px-3 py-1 text-sm ${k.key === kind.key ? "border-foreground bg-foreground text-background" : "hover:bg-accent"}`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{kind.blurb}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="au-subject">What or who it covers (optional)</Label>
              <Input id="au-subject" name="subject" placeholder="e.g. Mrs A's medicines" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="au-held">Carried out on</Label>
              <Input
                id="au-held"
                name="heldOn"
                type="date"
                max={today}
                value={heldOn}
                onChange={(e) => {
                  setHeldOn(e.target.value);
                  setNextDue(addMonths(e.target.value, kind.intervalMonths));
                }}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="au-next">Next one due</Label>
              <Input id="au-next" name="nextDue" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Every {kind.intervalMonths === 1 ? "month" : `${kind.intervalMonths} months`} unless you change it.
              </p>
            </div>
          </div>

          <ol className="space-y-2">
            {kind.questions.map((q, i) => {
              const a = answers[q.id];
              return (
                <li key={q.id} className={`space-y-2 rounded-lg border p-3 ${a === "no" ? "border-rose-200 bg-rose-50/40" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">
                      {i + 1}. {q.text}
                    </span>
                    <span className="flex gap-1">
                      {ANSWERS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`cursor-pointer rounded-md border px-2 py-0.5 text-xs ${a === opt.value ? "border-foreground bg-foreground text-background" : ""}`}
                        >
                          <input
                            type="radio"
                            name={`q_${q.id}`}
                            value={opt.value}
                            checked={a === opt.value}
                            onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                            className="sr-only"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </span>
                  </div>
                  {a === "no" && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-rose-700">Action:</span>
                      <select name={`owner_${q.id}`} className={selectClass} defaultValue="">
                        <option value="">No owner — note it only</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <Input name={`due_${q.id}`} type="date" className="h-8 w-auto" aria-label="Done by" />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="space-y-1">
            <Label htmlFor="au-notes">Notes (optional)</Label>
            <textarea id="au-notes" name="notes" rows={3} className={textareaClass} />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={pending || answered < kind.questions.length}>
              {pending ? "Saving…" : "Save audit"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {answered} of {kind.questions.length} answered{score !== null ? ` · ${score}% met` : ""}
            </span>
            {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

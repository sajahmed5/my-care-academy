"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isFieldVisible, type FormField } from "@/lib/forms";
import { submitFormResponseAction, type SubmitState } from "../actions";

const inputClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Fill a form in. Answers are kept in one object and sent as one JSON field,
 * validated again on the server. A signature is a typed name: good enough for
 * "I confirm this is mine", and far more reliable on a phone than a canvas.
 */
export function FormComplete({
  assignmentId,
  fields,
  doneMessage = "Thank you — your answers are saved and your manager can see them.",
  doneHref,
  doneLabel = "Back",
}: {
  assignmentId: string;
  fields: FormField[];
  /** What to say once saved; a manager completing their own form reads differently. */
  doneMessage?: string;
  doneHref?: string;
  doneLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [signedName, setSignedName] = useState("");
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(submitFormResponseAction, {});

  const visible = fields.filter((f) => isFieldVisible(f, values));
  const set = (id: string, v: unknown) => setValues((prev) => ({ ...prev, [id]: v }));
  const missing = new Set(state.missing ?? []);

  if (state.ok) {
    return (
      <Card>
        <CardContent className="space-y-2 py-8 text-center text-sm">
          <p>{doneMessage}</p>
          {doneHref && (
            <Link href={doneHref} className="text-primary hover:underline">
              ← {doneLabel}
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="answers" value={JSON.stringify(values)} />

      {visible.map((f) => {
        const flagged = missing.has(f.label);
        const label = (
          <Label htmlFor={`q-${f.id}`} className={flagged ? "text-rose-600" : undefined}>
            {f.label}
            {f.required && <span aria-hidden> *</span>}
          </Label>
        );
        return (
          <Card key={f.id}>
            <CardContent className="space-y-2 pt-6">
              {label}
              {f.type === "text" && (
                <Input id={`q-${f.id}`} value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
              )}
              {f.type === "number" && (
                <Input id={`q-${f.id}`} type="number" value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
              )}
              {f.type === "date" && (
                <Input id={`q-${f.id}`} type="date" value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
              )}
              {f.type === "textarea" && (
                <textarea id={`q-${f.id}`} rows={4} className={textareaClass} value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
              )}
              {f.type === "select" && (
                <select id={`q-${f.id}`} className={inputClass} value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)}>
                  <option value="">Choose…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              )}
              {f.type === "radio" && (
                <div className="space-y-1">
                  {f.options.map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm">
                      <input type="radio" name={`q-${f.id}`} value={o} checked={values[f.id] === o} onChange={() => set(f.id, o)} />
                      {o}
                    </label>
                  ))}
                </div>
              )}
              {f.type === "checkbox" && (
                <div className="space-y-1">
                  {f.options.map((o) => {
                    const current = Array.isArray(values[f.id]) ? (values[f.id] as string[]) : [];
                    return (
                      <label key={o} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={current.includes(o)}
                          onChange={(e) => set(f.id, e.target.checked ? [...current, o] : current.filter((x) => x !== o))}
                        />
                        {o}
                      </label>
                    );
                  })}
                </div>
              )}
              {f.type === "file" && (
                <p className="text-xs text-muted-foreground">
                  File uploads are not available on this form yet — hand the document to your manager.
                </p>
              )}
              {f.type === "signature" && (
                <div className="space-y-1">
                  <Input
                    id={`q-${f.id}`}
                    name="signedName"
                    placeholder="Type your full name"
                    value={signedName}
                    onChange={(e) => {
                      setSignedName(e.target.value);
                      set(f.id, e.target.value);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Typing your name here is your signature, recorded with the date and time.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {state.error && (
        <p className="text-sm text-rose-600">
          {state.error}
          {state.missing?.length ? ` Still needed: ${state.missing.join(", ")}.` : ""}
        </p>
      )}
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Submit"}</Button>
    </form>
  );
}

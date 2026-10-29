"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/recruit/application-fields";
import { isShown, type Answers, type FieldError } from "@/lib/recruitment-application";
import { SHADOWING_SECTIONS } from "@/lib/recruitment-shadowing";
import { saveShadowingAction } from "../../actions";

/** One page, saved as you go, finished on purpose: the same shape as the interview record. */
export function ShadowingForm({ candidateId, initial, complete, flags }: { candidateId: string; initial: Answers; complete: boolean; flags: string[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(complete ? "Finished. You can still change it and save again." : null);
  const [pending, start] = useTransition();
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const change = (id: string, value: Answers[string]) => {
    const next = { ...latest.current, [id]: value };
    latest.current = next;
    setAnswers(next);
    if (complete) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveShadowingAction(candidateId, latest.current, false), 2000);
  };

  const save = (finish: boolean) =>
    start(async () => {
      if (timer.current) clearTimeout(timer.current);
      const r = await saveShadowingAction(candidateId, latest.current, finish || complete);
      if (!r.ok) {
        setErrors(Object.values(r.problems ?? {}).flat());
        setMessage(r.error ?? "That didn't save.");
        return;
      }
      setErrors([]);
      if (finish || complete) router.push(`/org/recruitment/${candidateId}`);
      else setMessage("Saved.");
    });

  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-sm text-muted-foreground">
        Ask the mentor after the shift, or let them fill it in here. A &ldquo;no&rdquo; on the important questions needs a reason.
      </p>
      {flags.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">To read first</p>
          <ul className="mt-1 list-disc pl-5">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      {SHADOWING_SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={`sh-${section.id}`} className="rounded-2xl border bg-card p-5">
          <h2 id={`sh-${section.id}`} className="font-semibold">{section.title}</h2>
          <div className="mt-4 space-y-4">
            {section.fields.filter((f) => isShown(f, answers)).map((f) => (
              <Field key={f.id} field={f} value={answers[f.id] as string | string[] | boolean | undefined} onChange={(v) => change(f.id, v)} errors={errors} path={f.id} />
            ))}
          </div>
        </section>
      ))}
      {errors.length > 0 && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errors.length === 1 ? "One answer needs" : `${errors.length} answers need`} filling in above.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={pending} onClick={() => save(true)}>{complete ? "Save changes" : "Finish the record"}</Button>
        {!complete && <Button size="lg" variant="outline" disabled={pending} onClick={() => save(false)}>Save for now</Button>}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/recruit/application-fields";
import { isShown, type Answers, type FieldError } from "@/lib/recruitment-application";
import { INTERVIEW_SECTIONS } from "@/lib/recruitment-interview";
import { saveInterviewAction } from "../../actions";

/** One long page, saved as you go: an interview isn't a form to page through. */
export function InterviewForm({
  candidateId,
  initial,
  complete,
  whyCare,
  experience,
}: {
  candidateId: string;
  initial: Answers;
  complete: boolean;
  whyCare: string | null;
  experience: string | null;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(complete ? "Finished. You can still change it and save again." : null);
  const [pending, start] = useTransition();
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const change = (id: string, value: Answers[string]) => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      latest.current = next;
      return next;
    });
    if (complete) return; // a finished record is saved on purpose, not by the timer
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveInterviewAction(candidateId, latest.current, false), 2000);
  };

  const save = (finish: boolean) =>
    start(async () => {
      if (timer.current) clearTimeout(timer.current);
      const r = await saveInterviewAction(candidateId, latest.current, finish || complete);
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
        Type what they actually did and said: these notes are what the offer letter is written from. The candidate never sees this page.
      </p>
      {INTERVIEW_SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={`iv-${section.id}`} className="rounded-2xl border bg-card p-5">
          <h2 id={`iv-${section.id}`} className="font-semibold">{section.title}</h2>
          {section.intro && <p className="mt-1 text-sm text-muted-foreground">{section.intro}</p>}
          {section.id === "ivValues" && (whyCare || experience) && (
            <div className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">
              {whyCare && <p><span className="font-medium">On their application, why care:</span> {whyCare}</p>}
              {experience && <p className="mt-1"><span className="font-medium">Their care experience:</span> {experience}</p>}
            </div>
          )}
          <div className="mt-4 space-y-4">
            {section.fields.filter((f) => isShown(f, answers)).map((f) => (
              <Field key={f.id} field={f} value={answers[f.id]} onChange={(v) => change(f.id, v)} errors={errors} path={f.id} />
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
        <Button size="lg" disabled={pending} onClick={() => save(true)}>
          {complete ? "Save changes" : "Finish the interview"}
        </Button>
        {!complete && (
          <Button size="lg" variant="outline" disabled={pending} onClick={() => save(false)}>Save for now</Button>
        )}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/recruit/application-fields";
import { isShown, type Answers, type FieldError } from "@/lib/recruitment-application";
import { REFERENCE_SECTIONS } from "@/lib/recruitment-references";
import { loadReferenceAction, submitReferenceAction, type LoadedReference } from "./actions";

/** The reference form on one page: the candidate named at the top, the questions below. */
export function ReferenceForm({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<LoadedReference | { error: string } | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    void loadReferenceAction(token).then((r) => {
      setLoaded(r);
      if (!("error" in r)) setAnswers(r.prefill);
    });
  }, [token]);

  if (!loaded) return <p className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">Loading…</p>;
  if ("error" in loaded) {
    return (
      <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-5">
        <h1 className="text-xl font-semibold">This link can&apos;t be used</h1>
        <p className="mt-2 text-sm text-muted-foreground">{loaded.error}</p>
      </div>
    );
  }
  if (sent || loaded.received) {
    return (
      <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-5 text-center">
        <CheckCircle2 className="mx-auto size-12 text-primary" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-semibold">Thank you</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your reference for {loaded.candidate} has been sent to {loaded.company}.</p>
      </div>
    );
  }
  const change = (id: string, v: Answers[string]) => setAnswers((a) => ({ ...a, [id]: v }));
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8">
      <header>
        <p className="text-sm font-semibold text-accent-foreground">{loaded.company}</p>
        <h1 className="mt-1 text-2xl font-semibold">A reference for {loaded.candidate}</h1>
        {loaded.dob && <p className="mt-1 text-sm text-muted-foreground">Date of birth: {loaded.dob}</p>}
        <p className="mt-2 text-sm text-muted-foreground">
          {loaded.kind === "employer" ? "As their employer" : "As someone who knows them"}, please answer honestly: carers work alone with
          people who may be vulnerable.
        </p>
      </header>
      {REFERENCE_SECTIONS[loaded.kind].map((s) => (
        <section key={s.id} aria-labelledby={`r-${s.id}`} className="rounded-2xl border bg-card p-5">
          <h2 id={`r-${s.id}`} className="font-semibold">{s.title}</h2>
          {s.intro && <p className="mt-1 text-sm text-muted-foreground">{s.intro}</p>}
          <div className="mt-4 space-y-4">
            {s.fields.filter((f) => isShown(f, answers)).map((f) => (
              <Field key={f.id} field={f} value={answers[f.id]} onChange={(v) => change(f.id, v)} errors={errors} path={f.id} />
            ))}
          </div>
        </section>
      ))}
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await submitReferenceAction(token, answers);
            if (r.ok) setSent(true);
            else {
              setErrors(Object.values(r.problems ?? {}).flat());
              setMessage(r.error ?? "Your reference couldn't be sent. Try again.");
            }
          })
        }
      >
        {pending ? "Sending…" : "Send my reference"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Powered by My Care Academy</p>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/recruit/application-fields";
import { isShown, validateSection, type Answers, type FieldError } from "@/lib/recruitment-application";
import { STARTER_SECTIONS, validateStarter } from "@/lib/recruitment-starter";
import { saveStarterAction, submitStarterAction } from "../../actions";

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * One section at a time, saved as they go, sent in from the last section.
 * The rules live in lib/recruitment-starter.ts; the server checks again.
 */
export function StarterForm({ candidateId, initial, note }: { candidateId: string; initial: Answers; note: string | null }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "failed">("saved");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const latest = useRef<Answers>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async () => {
    setSaveState("saving");
    const r = await saveStarterAction(candidateId, latest.current);
    setSaveState(r.ok ? "saved" : "failed");
  };
  const change = (id: string, v: Answers[string]) => {
    const next = { ...latest.current, [id]: v };
    latest.current = next;
    setAnswers(next);
    setSaveState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1500);
  };

  const section = STARTER_SECTIONS[step];
  const last = step === STARTER_SECTIONS.length - 1;

  const next = async () => {
    const found = validateSection(section, answers, todayIso());
    setErrors(found);
    if (found.length) {
      document.getElementById(`f-${found[0].field}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    if (!last) {
      void save();
      setStep(step + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    const all = validateStarter(answers, todayIso());
    const firstBad = STARTER_SECTIONS.findIndex((s) => all[s.id]?.length);
    if (firstBad >= 0) {
      setStep(firstBad);
      setErrors(all[STARTER_SECTIONS[firstBad].id]);
      return;
    }
    setBusy(true);
    setSubmitError(null);
    const r = await submitStarterAction(candidateId, answers);
    setBusy(false);
    if (!r.ok) {
      setSubmitError(r.error ?? "Your form couldn't be sent. Try again.");
      return;
    }
    router.push("/my-application");
  };

  const saveText = saveState === "saved" ? "All answers saved" : saveState === "saving" ? "Saving…" : saveState === "failed" ? "Not saved: check your connection" : "Saving soon…";

  return (
    <div className="mx-auto max-w-xl px-4 pb-28 pt-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">After your offer</p>
        <h1 className="mt-0.5 text-xl font-semibold">Health, equality and DBS form</h1>
        {note && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="text-xs font-semibold uppercase tracking-wide">The office has asked you to change something</p>
            <p className="mt-0.5">{note}</p>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={STARTER_SECTIONS.length} aria-valuenow={step + 1}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / STARTER_SECTIONS.length) * 100}%` }} />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{step + 1} of {STARTER_SECTIONS.length}</span>
        </div>
        <p className={`mt-1.5 text-xs ${saveState === "failed" ? "font-medium text-destructive" : "text-muted-foreground"}`} aria-live="polite">{saveText}</p>
      </header>

      <section className="mt-5">
        <h2 className="text-lg font-semibold">{section.title}</h2>
        {section.intro && <p className="mt-1 text-sm text-muted-foreground">{section.intro}</p>}
        <div className="mt-4 space-y-4">
          {section.fields.filter((f) => isShown(f, answers)).map((f) => (
            <Field key={f.id} field={f} value={answers[f.id] as string | string[] | boolean | undefined} onChange={(v) => change(f.id, v)} errors={errors} path={f.id} />
          ))}
        </div>
        {errors.length > 0 && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.length === 1 ? "One answer needs" : `${errors.length} answers need`} attention above.
          </p>
        )}
        {submitError && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </section>

      <nav className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-3 px-4 py-3">
          <button
            type="button"
            disabled={step === 0 || busy}
            onClick={() => { setErrors([]); setStep(step - 1); window.scrollTo({ top: 0 }); }}
            className="min-h-11 rounded-lg border px-4 text-sm font-semibold disabled:opacity-40"
          >
            Back
          </button>
          <button type="button" disabled={busy} onClick={() => void next()} className="min-h-11 flex-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Sending…" : last ? "Send my form" : "Save and continue"}
          </button>
        </div>
      </nav>
    </div>
  );
}

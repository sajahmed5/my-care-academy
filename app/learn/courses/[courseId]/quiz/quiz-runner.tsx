"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ClipboardCheck, Clock, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Confetti } from "@/components/confetti";
import { PASS_PERCENT, QUIZ_TARGET, type PublicQuestion } from "@/lib/quiz";
import {
  startQuizAction,
  submitQuizAction,
  type SubmitQuizResult,
} from "@/app/learn/quiz-actions";

type Phase = "intro" | "running" | "result";
type AnswerMap = Record<string, unknown>;

/** True when a question has an answer suitable to submit. */
function isAnswered(q: PublicQuestion, a: unknown): boolean {
  switch (q.type) {
    case "mcq":
    case "true_false":
      return typeof a === "number";
    case "multi":
    case "hotspot":
      return Array.isArray(a) && a.length > 0;
    case "fill_blank":
      return Array.isArray(a) && a.length === q.blanks && a.every((s) => String(s ?? "").trim() !== "");
  }
}

const TYPE_HINT: Record<PublicQuestion["type"], string> = {
  mcq: "Choose one answer",
  true_false: "True or false?",
  multi: "Select all that apply",
  fill_blank: "Type the missing word(s)",
  hotspot: "Click all that apply on the image",
};

export function QuizRunner({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [result, setResult] = useState<SubmitQuizResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const setAnswer = (id: string, value: unknown) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  // When results render with newly-earned stars, fly them from the results card
  // up to the header star bank. Runs after paint so the card (and its ref) exist.
  useEffect(() => {
    const gained = result?.starsAwarded ?? 0;
    if (gained <= 0) return;
    const raf = requestAnimationFrame(() => {
      const rect = resultRef.current?.getBoundingClientRect();
      const origin = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 160) }
        : undefined;
      window.dispatchEvent(
        new CustomEvent("mca:award-stars", { detail: { count: gained, origin } }),
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [result]);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await startQuizAction(courseId);
    setBusy(false);
    if (!res.ok || !res.questions) {
      setError(res.error ?? "Could not start.");
      return;
    }
    setAttemptId(res.attemptId!);
    setQuestions(res.questions);
    setAnswers({});
    setPhase("running");
  }

  async function submit() {
    if (!attemptId) return;
    setBusy(true);
    setError(null);
    const res = await submitQuizAction(attemptId, answers);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not submit.");
      return;
    }
    setResult(res);
    setPhase("result");
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function download() {
    if (!result?.certificateId) return;
    window.open(`/learn/certificates/${result.certificateId}/download`, "_blank");
  }

  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  if (phase === "intro") {
    return (
      // The facts a carer needs before pressing Start, as facts rather than a
      // grey bullet list — and the one that costs them (leaving part way
      // means starting again) where it can't be missed (design review,
      // 28 Oct 2026).
      <div className="mx-auto max-w-2xl space-y-6 rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-primary">
            <ClipboardCheck className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Ready for the assessment?</h2>
            <p className="text-sm text-muted-foreground">{courseTitle}</p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-muted/60 px-2 py-3">
            <dt className="text-xs text-muted-foreground">Questions</dt>
            <dd className="whitespace-nowrap text-lg font-semibold sm:text-xl">Up to {QUIZ_TARGET}</dd>
          </div>
          <div className="rounded-2xl bg-muted/60 px-2 py-3">
            <dt className="text-xs text-muted-foreground">To pass</dt>
            <dd className="whitespace-nowrap text-lg font-semibold sm:text-xl">{PASS_PERCENT}%</dd>
          </div>
          <div className="rounded-2xl bg-muted/60 px-2 py-3">
            <dt className="text-xs text-muted-foreground">Retakes</dt>
            <dd className="whitespace-nowrap text-lg font-semibold sm:text-xl">Unlimited</dd>
          </div>
        </dl>
        <p className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Finish it in one sitting.</strong> If you leave part way
            through, you can&apos;t pick it up again — you start a new one.
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          Questions are picked at random from the course: multiple choice,
          select-all, true or false, fill the gap and click-the-picture.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={start} disabled={busy}>
            {busy ? "Starting…" : "Start assessment"}
          </Button>
          <Link
            href={`/learn/courses/${courseId}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Review the course
          </Link>
          <Link href="/learn" className="self-center text-sm text-muted-foreground hover:underline">
            Back to my training
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "running") {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="sticky top-0 z-10 -mx-2 bg-background/90 px-2 py-2 backdrop-blur">
          <h2 className="text-xl font-semibold">{courseTitle} — assessment</h2>
          <p className="text-sm text-muted-foreground">{answeredCount} of {questions.length} answered</p>
        </div>
        {questions.map((q, qi) => (
          <div key={q.id} className="space-y-3 rounded-xl border p-4">
            <div>
              <p className="font-medium">{qi + 1}. {q.type === "fill_blank" ? "Complete the sentence" : q.question}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TYPE_HINT[q.type]}</p>
            </div>
            <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="sticky bottom-0 -mx-2 bg-background/90 px-2 py-3 backdrop-blur">
          <Button onClick={submit} disabled={busy || !allAnswered} className="w-full sm:w-auto">
            {busy ? "Submitting…" : allAnswered ? "Submit assessment" : `Answer all questions (${answeredCount}/${questions.length})`}
          </Button>
        </div>
      </div>
    );
  }

  // result
  return (
    <div ref={resultRef} className="mx-auto max-w-2xl space-y-6 text-center">
      {result?.passed && <Confetti />}
      <h2 className="text-2xl font-semibold">{result?.passed ? "Passed 🎉" : "Not passed"}</h2>
      <p className="text-lg">
        You scored <strong>{result?.score}%</strong> ({result?.correct}/{result?.total} correct). Pass mark is {PASS_PERCENT}%.
      </p>
      {result && (
        <p className="text-sm font-medium text-amber-600">
          {result.starsAwarded && result.starsAwarded > 0
            ? `+${result.starsAwarded} ⭐ added to your star bank`
            : "No new stars this time — you've already banked your best for this course."}
        </p>
      )}
      {result?.passed ? (
        <div className="space-y-6">
          <p className="text-muted-foreground">
            A certificate has been issued. Your newest certificate is the live one for compliance.
          </p>

          {result.review && result.review.length > 0 && (
            <div className="space-y-2 text-left">
              <h3 className="text-sm font-semibold">Your answers</h3>
              <ul className="divide-y rounded-2xl border bg-card">
                {result.review.map((r, i) => (
                  <li key={i} className="flex items-start gap-3 p-3">
                    <span
                      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                        r.correct ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {r.correct ? <Check className="size-4" /> : <X className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium">{r.question}</p>
                      {!r.correct && (
                        <div className="text-xs">
                          <p className="text-rose-600">Your answer: {r.your}</p>
                          <p className="text-green-700">Correct answer: {r.answer}</p>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-center gap-3">
            {result.certificateId && <Button onClick={download}>Download certificate</Button>}
            <Link href="/learn" className="self-center text-sm text-muted-foreground hover:underline">Back to my training</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="mx-auto max-w-md text-muted-foreground">
            Go back through the course and focus on the areas you found tricky, then
            retake the assessment. We don&apos;t show the answers for a failed attempt.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href={`/learn/courses/${courseId}`} className={buttonVariants()}>
              Review the course
            </Link>
            <Button variant="outline" onClick={() => { setResult(null); setPhase("intro"); }}>
              Retake assessment
            </Button>
            <Link href="/learn" className="self-center text-sm text-muted-foreground hover:underline">Back to my training</Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders the appropriate input for each question type. */
function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: PublicQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (q.type) {
    case "mcq":
    case "true_false":
      return (
        <div className="space-y-2">
          {q.options.map((opt, oi) => (
            <label key={oi} className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:font-medium">
              <input type="radio" name={q.id} checked={value === oi} onChange={() => onChange(oi)} />
              {opt}
            </label>
          ))}
        </div>
      );

    case "multi": {
      const arr = Array.isArray(value) ? (value as number[]) : [];
      const toggle = (oi: number) =>
        onChange(arr.includes(oi) ? arr.filter((n) => n !== oi) : [...arr, oi]);
      return (
        <div className="space-y-2">
          {q.options.map((opt, oi) => (
            <label key={oi} className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:font-medium">
              <input type="checkbox" checked={arr.includes(oi)} onChange={() => toggle(oi)} />
              {opt}
            </label>
          ))}
        </div>
      );
    }

    case "fill_blank": {
      const parts = q.question.split(/_{2,}/);
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const blanks = q.blanks;
      const setBlank = (i: number, v: string) => {
        const next = [...arr];
        while (next.length < blanks) next.push("");
        next[i] = v;
        onChange(next);
      };
      return (
        <p className="text-sm leading-8">
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && (
                <input
                  type="text"
                  value={arr[i] ?? ""}
                  onChange={(e) => setBlank(i, e.target.value)}
                  className="mx-1 w-32 rounded-md border-b-2 border-primary bg-muted/40 px-2 py-1 text-sm outline-none focus:bg-muted"
                  aria-label={`Blank ${i + 1}`}
                />
              )}
            </span>
          ))}
        </p>
      );
    }

    case "hotspot": {
      const arr = Array.isArray(value) ? (value as number[]) : [];
      const toggle = (id: number) =>
        onChange(arr.includes(id) ? arr.filter((n) => n !== id) : [...arr, id]);
      return (
        <div className="space-y-2">
          <div className="relative w-full overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={q.image} alt="" className="block w-full select-none" draggable={false} />
            {q.zones.map((z) => {
              const selected = arr.includes(z.id);
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => toggle(z.id)}
                  title={z.label}
                  className={`absolute rounded-md border-2 transition-colors ${
                    selected ? "border-primary bg-primary/30" : "border-transparent hover:border-primary/60 hover:bg-primary/10"
                  }`}
                  style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
                  aria-label={z.label ?? `Area ${z.id}`}
                />
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Tap each spot you think applies. Tap again to deselect.</p>
        </div>
      );
    }
  }
}

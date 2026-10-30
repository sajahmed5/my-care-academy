"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/recruit/application-fields";
import { textareaClass, selectClass } from "@/components/hr/fields";
import { isShown, type Answers, type FieldError } from "@/lib/recruitment-application";
import { FINAL_OUTCOMES, INTERIM_OUTCOMES, PROBATION_SECTIONS } from "@/lib/hr/probation";
import { saveProbationReviewAction, type ReviewOutcomeInput } from "../../actions";

/** The review, saved as you go and finished on purpose; a final review's outcome starts its letter. */
export function ReviewForm({
  id,
  userId,
  isFinal,
  held,
  initial,
  initialOutcome,
  letterIds,
}: {
  id: string;
  userId: string;
  isFinal: boolean;
  held: boolean;
  initial: Answers;
  initialOutcome: ReviewOutcomeInput;
  letterIds: string[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial);
  const [o, setO] = useState<ReviewOutcomeInput>(initialOutcome);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<string | null>(held ? "This review has been finished." : null);
  const [pending, start] = useTransition();
  const latest = useRef({ answers: initial, o: initialOutcome });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autosave = () => {
    if (held) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveProbationReviewAction(id, latest.current.answers, latest.current.o, false), 2000);
  };
  const change = (fid: string, value: Answers[string]) => {
    const next = { ...latest.current.answers, [fid]: value };
    latest.current.answers = next;
    setAnswers(next);
    autosave();
  };
  const changeO = (patch: Partial<ReviewOutcomeInput>) => {
    const next = { ...latest.current.o, ...patch };
    latest.current.o = next;
    setO(next);
    autosave();
  };
  const submit = (finish: boolean) =>
    start(async () => {
      if (timer.current) clearTimeout(timer.current);
      const r = await saveProbationReviewAction(id, latest.current.answers, latest.current.o, finish);
      if (!r.ok) {
        setErrors(r.problems ?? []);
        setMessage(r.error ?? "That didn't save.");
        return;
      }
      setErrors([]);
      if (!finish) return setMessage("Saved.");
      if (r.letterId) router.push(`/org/hr/letters/${r.letterId}?back=${encodeURIComponent(`/org/staff/${userId}?section=employment`)}`);
      else router.push(`/org/staff/${userId}?section=employment`);
    });

  const outcomes = isFinal ? FINAL_OUTCOMES : INTERIM_OUTCOMES;
  return (
    <div className="space-y-5">
      <fieldset disabled={held} className="space-y-5">
        {PROBATION_SECTIONS.map((section) => (
          <section key={section.id} aria-labelledby={`pb-${section.id}`} className="rounded-2xl border bg-card p-5">
            <h2 id={`pb-${section.id}`} className="font-semibold">{section.title}</h2>
            <div className="mt-4 space-y-4">
              {section.fields.filter((f) => isShown(f, answers)).map((f) => (
                <Field key={f.id} field={f} value={answers[f.id] as string | string[] | boolean | undefined} onChange={(v) => change(f.id, v)} errors={errors} path={f.id} />
              ))}
            </div>
          </section>
        ))}
        <section aria-labelledby="pb-outcome" className="space-y-3 rounded-2xl border bg-card p-5">
          <h2 id="pb-outcome" className="font-semibold">{isFinal ? "The outcome of their probation" : "How they're getting on"}</h2>
          <div className="flex flex-wrap gap-2">
            {outcomes.map((x) => (
              <label key={x.value} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${o.outcome === x.value ? "border-primary bg-primary/5" : ""}`}>
                <input type="radio" name="outcome" value={x.value} checked={o.outcome === x.value} onChange={() => changeO({ outcome: x.value })} />
                {x.label}
              </label>
            ))}
          </div>
          {o.outcome === "extended" && (
            <div className="space-y-1.5">
              <label htmlFor="pb-months" className="text-sm font-medium">Extend by</label>
              <select id="pb-months" className={`${selectClass} w-40`} value={o.extendMonths ?? ""} onChange={(e) => changeO({ extendMonths: Number(e.target.value) || null })}>
                <option value="">Choose…</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n} month{n === 1 ? "" : "s"}</option>
                ))}
              </select>
            </div>
          )}
          {(o.outcome === "extended" || o.outcome === "not_passed" || o.outcome === "concerns") && (
            <div className="space-y-1.5">
              <label htmlFor="pb-reason" className="text-sm font-medium">{o.outcome === "concerns" ? "The concerns" : "Why"}</label>
              <textarea id="pb-reason" rows={4} className={textareaClass} value={o.reason} onChange={(e) => changeO({ reason: e.target.value })} />
              {o.outcome !== "concerns" && <p className="text-xs text-muted-foreground">It goes in their letter, which you check before it is sent.</p>}
            </div>
          )}
          {o.outcome === "not_passed" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Not passing should follow your capability process: the concerns raised with them at earlier reviews, support given, and time to improve. The ending letter gives them the right to appeal.
            </p>
          )}
        </section>
      </fieldset>
      {held ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">{message}</span>
          {letterIds.map((l) => (
            <Link key={l} href={`/org/hr/letters/${l}`} className="font-medium text-primary hover:underline">
              Open the letter
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={pending} onClick={() => submit(true)}>
            Finish the review{isFinal && o.outcome && o.outcome !== "on_track" ? " and write the letter" : ""}
          </Button>
          <Button size="lg" variant="outline" disabled={pending} onClick={() => submit(false)}>Save for now</Button>
          {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        </div>
      )}
    </div>
  );
}

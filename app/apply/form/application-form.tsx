"use client";

/**
 * Brought across from MyRoster (src/components/recruit/CandidateApplicationForm.tsx)
 * on 29 Oct 2026, talking to server actions (app/apply/actions.ts) in place
 * of its API route.
 *
 * The online application form, opened from the company's apply link or the
 * link the office emails — no account at this stage. One section at a time on a phone; answers save as the
 * candidate goes (and when they move between sections), so a long form can be
 * finished over several sittings with the same link.
 *
 * The questions and every rule live in lib/recruitment-application.ts.
 * This component only shows them; the server re-checks the lot on submit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SignaturePad } from "@/app/org/forms/[id]/fill/signature-pad";
import {
  APPLICATION_SECTIONS, employmentGaps, isShown, refereesRequired, validateApplication, validateSection,
  type Answers, type Entry, type FieldError,
} from "@/lib/recruitment-application";
import { Field, RepeatField } from "@/components/recruit/application-fields";
import { loadApplicationAction, saveApplicationAction, submitApplicationAction } from "../actions";

type State = "loading" | "bad" | "form" | "submitted";
const todayIso = () => new Date().toISOString().slice(0, 10);

export function ApplicationForm({ token }: { token: string }) {
  const [state, setState] = useState<State>("loading");
  const [badReason, setBadReason] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  // What the office asked them to change when it reopened the form.
  const [officeNote, setOfficeNote] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0); // APPLICATION_SECTIONS.length = review & sign
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [problems, setProblems] = useState<Record<string, FieldError[]>>({});
  const [signature, setSignature] = useState<{ dataUrl: string | null; signedName: string }>({ dataUrl: null, signedName: "" });
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "failed">("saved");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const latest = useRef<Answers>({});
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const json = await loadApplicationAction(token);
        if (!live) return;
        if ("error" in json) { setBadReason(json.error); setState("bad"); return; }
        setCompany(json.company);
        setOfficeNote(typeof json.officeNote === "string" && json.officeNote.trim() ? json.officeNote : null);
        setFirstName(json.firstName ?? "");
        if (json.status === "submitted") { setState("submitted"); return; }
        latest.current = json.answers ?? {};
        setAnswers(latest.current);
        setState("form");
      } catch {
        if (live) setState("bad");
      }
    })();
    return () => { live = false; };
  }, [token]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty.current) return true;
    dirty.current = false;
    setSaveState("saving");
    try {
      const res = await saveApplicationAction(token, latest.current);
      if (!res.ok) throw new Error();
      setSaveState(dirty.current ? "unsaved" : "saved");
      return true;
    } catch {
      dirty.current = true;
      setSaveState("failed");
      return false;
    }
  }, [token]);

  const change = (id: string, value: Answers[string]) => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      latest.current = next;
      return next;
    });
    dirty.current = true;
    setSaveState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, 1500);
  };

  // Leaving the page with unsaved answers: one last try, and a warning.
  useEffect(() => {
    const onHide = () => { if (dirty.current) void save(); };
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); } };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("beforeunload", onUnload); };
  }, [save]);

  const sections = APPLICATION_SECTIONS;
  const onReview = step >= sections.length;
  const section = onReview ? null : sections[step];
  const gaps = useMemo(() => employmentGaps(answers, todayIso()), [answers]);
  const referees = refereesRequired(answers);

  const goTo = async (next: number) => {
    await save();
    setErrors([]);
    setStep(Math.max(0, Math.min(sections.length, next)));
    window.scrollTo({ top: 0 });
  };

  const next = async () => {
    if (!section) return;
    const found = validateSection(section, answers, todayIso());
    setErrors(found);
    if (found.length) {
      // Take them to the first problem rather than leaving it off-screen.
      const first = document.getElementById(`f-${found[0].field.replace(/\./g, "-")}`) ?? document.querySelector("[role=alert]");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (step + 1 === sections.length) setProblems(validateApplication(answers, todayIso()));
    await goTo(step + 1);
  };

  const submit = async () => {
    const found = validateApplication(answers, todayIso());
    setProblems(found);
    if (Object.keys(found).length) { setSubmitError("Some sections still need attention — they are listed above."); return; }
    if (!signature?.dataUrl || !signature.signedName?.trim()) { setSubmitError("Please sign in the box and type your full name."); return; }
    setBusy(true);
    setSubmitError(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      const json = await submitApplicationAction(token, latest.current, { dataUrl: signature.dataUrl!, signedName: signature.signedName });
      if (!json.ok) {
        if (json.problems) setProblems(json.problems);
        setSubmitError(json.error || "Your application could not be sent. Please try again.");
        return;
      }
      dirty.current = false;
      setState("submitted");
      window.scrollTo({ top: 0 });
    } catch {
      setSubmitError("Your application could not be sent. Check your connection and try again — your answers are saved.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading your application…</div>;

  if (state === "bad") {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10">
        <h1 className="text-xl font-semibold text-slate-900">This link can&apos;t be used</h1>
        <p className="mt-2 text-sm text-slate-600">{badReason || "This link has expired or is no longer valid. Ask the office to send you a new one."}</p>
      </div>
    );
  }

  if (state === "submitted") {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg className="h-7 w-7" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4 10l4 4 8-8" /></svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Application received</h1>
        <p className="mt-2 text-sm text-slate-600">Thank you{firstName ? `, ${firstName}` : ""}. {company || "We"} will read your application and be in touch about the next step.</p>
        <p className="mt-4 text-xs text-slate-400">You can close this page.</p>
      </div>
    );
  }

  const saveText = saveState === "saved" ? "All answers saved" : saveState === "saving" ? "Saving…" : saveState === "failed" ? "Not saved — check your connection" : "Saving soon…";

  return (
    <div className="mx-auto max-w-xl px-4 pb-28 pt-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{company || "Application"}</p>
        <h1 className="mt-0.5 text-xl font-semibold text-slate-900">Application form</h1>
        {officeNote && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="text-xs font-semibold uppercase tracking-wide">The office has asked you to change something</p>
            <p className="mt-0.5">{officeNote}</p>
            <p className="mt-1 text-xs text-amber-800">Your answers are all still here. Change what is needed, then send the form again from the last step.</p>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={sections.length} aria-valuenow={step}>
            <div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${(step / sections.length) * 100}%` }} />
          </div>
          <span className="shrink-0 text-xs text-slate-500">{onReview ? "Last step" : `${step + 1} of ${sections.length}`}</span>
        </div>
        <p className={`mt-1.5 text-xs ${saveState === "failed" ? "font-medium text-red-600" : "text-slate-400"}`} aria-live="polite">{saveText}</p>
      </header>

      {section && (
        <section className="mt-5">
          <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
          {section.intro && <p className="mt-1 text-sm text-slate-600">{section.intro}</p>}
          <div className="mt-4 space-y-4">
            {section.fields.filter((f) => isShown(f, answers)).map((f) => {
              if (f.id === "gapExplanation") {
                if (!gaps.length) return null;
                return (
                  <div key={f.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-900">There {gaps.length === 1 ? "is a break" : "are breaks"} in your employment history:</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">{gaps.map((g) => <li key={g.from}>{g.label}</li>)}</ul>
                    <div className="mt-3"><Field field={{ ...f, required: true }} value={answers[f.id]} onChange={(v) => change(f.id, v)} errors={errors} path={f.id} /></div>
                  </div>
                );
              }
              if (f.type === "repeat") {
                const isReferees = f.id === "referees";
                return (
                  <RepeatField key={f.id} field={f} entries={(Array.isArray(answers[f.id]) ? answers[f.id] : []) as Entry[]} onChange={(v) => change(f.id, v)} errors={errors}
                    minimum={isReferees ? referees.count : undefined}
                    addHint={isReferees ? `We need ${referees.count} referees${referees.needsEmployer ? " — one must be your most recent employer" : ""}.` : undefined} />
                );
              }
              return <Field key={f.id} field={f} value={answers[f.id]} onChange={(v) => change(f.id, v)} errors={errors} path={f.id} />;
            })}
          </div>
          {errors.length > 0 && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.length === 1 ? "One answer needs" : `${errors.length} answers need`} attention above.</p>}
        </section>
      )}

      {onReview && (
        <section className="mt-5">
          <h2 className="text-lg font-semibold text-slate-900">Check and sign</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {sections.map((s, i) => {
              const bad = problems[s.id]?.length ?? 0;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{s.title}</p>
                    <p className={`text-xs ${bad ? "text-red-600" : "text-emerald-700"}`}>{bad ? `${bad} thing${bad === 1 ? "" : "s"} to fix` : "Complete"}</p>
                  </div>
                  <button type="button" onClick={() => { void goTo(i).then(() => setErrors(problems[s.id] ?? [])); }} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{bad ? "Fix" : "Change"}</button>
                </li>
              );
            })}
          </ul>
          <div className="mt-5">
            <p className="text-sm font-medium text-slate-800">Your signature</p>
            <div className="mt-2"><SignaturePad onChange={(dataUrl) => setSignature((s) => ({ ...s, dataUrl }))} /></div>
            <label htmlFor="signed-name" className="mt-3 block text-sm font-medium text-slate-800">Your full name</label>
            <input id="signed-name" value={signature.signedName} onChange={(e) => setSignature((s) => ({ ...s, signedName: e.target.value }))} autoComplete="name" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-slate-500 focus:outline-none" />
          </div>
          {submitError && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
        </section>
      )}

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-3 px-4 py-3">
          <button type="button" disabled={step === 0 || busy} onClick={() => { void goTo(step - 1); }} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-40">Back</button>
          {onReview
            ? <button type="button" disabled={busy} onClick={() => { void submit(); }} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sending…" : "Send my application"}</button>
            : <button type="button" onClick={() => { void next(); }} className="flex-1 rounded-lg bg-slate-800 px-4 py-3 text-sm font-semibold text-white">{step + 1 === sections.length ? "Check and sign" : "Save and continue"}</button>}
        </div>
      </nav>
    </div>
  );
}

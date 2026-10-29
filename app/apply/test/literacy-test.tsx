"use client";

/**
 * Brought across from MyRoster (src/components/recruit/CandidateLiteracyTest.tsx)
 * on 29 Oct 2026, talking to a server action (./actions.ts) in place of its
 * API route.
 *
 * The literacy test as the candidate takes it: one question to a screen,
 * answered by tapping, with the time left always in view.
 *
 * This component knows NO answers. It draws whatever the server sends
 * (questions with the key stripped) and must never import lib/literacy-test
 * — tests/literacy-test.test.ts fails if it does.
 *
 * The countdown here is a display. The server stamped the deadline when Begin
 * was pressed and refuses anything late; when the display reaches zero the
 * page simply hands in what is there.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { literacyAction, type LiteracyReply } from "./actions";

interface Passage { title: string; text: string }
type Question =
  | { id: string; type: "choice"; marks: number; prompt: string; passage: Passage | null; options: string[] }
  | { id: string; type: "tapWords"; marks: number; prompt: string; passage: Passage | null; tokens: Array<{ show: string; word: string }>; pick: number }
  | { id: string; type: "spell"; marks: number; prompt: string; passage: Passage | null; words: string[] }
  | { id: string; type: "order"; marks: number; prompt: string; passage: Passage | null; tiles: string[]; joinWith: string | null };
type Answers = Record<string, string | string[] | undefined>;
type State = "loading" | "bad" | "ready" | "running" | "done";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const answered = (q: Question, a: Answers[string]) =>
  q.type === "choice" ? typeof a === "string" : q.type === "spell" ? Array.isArray(a) && q.words.every((_, i) => (a[i] ?? "").trim()) : q.type === "order" ? Array.isArray(a) && a.length === q.tiles.length : Array.isArray(a) && a.length > 0;

/** "Tap the words spelt wrongly": up to q.pick words, tap again to un-choose. */
function TapWords({ q, a, onChange }: { q: Extract<Question, { type: "tapWords" }>; a: Answers[string]; onChange: (v: string[]) => void }) {
  const picked = new Set(Array.isArray(a) ? a : []);
  const toggle = (w: string) => {
    const next = new Set(picked);
    if (next.has(w)) next.delete(w);
    else if (next.size < q.pick) next.add(w);
    else return;
    onChange([...next]);
  };
  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-x-1.5 gap-y-2 rounded-xl border border-slate-300 bg-white p-4 text-[17px] leading-relaxed">
        {q.tokens.map((t) => (
          <button key={t.word} type="button" aria-pressed={picked.has(t.word)} onClick={() => toggle(t.word)}
            className={`rounded-md px-1.5 py-0.5 ${picked.has(t.word) ? "bg-red-600 text-white" : "text-slate-900 active:bg-slate-100"}`}>{t.show}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{picked.size} of {q.pick} chosen. Tap a word again to un-choose it.</p>
    </div>
  );
}

/** "Tap these into the right order": tap to add, tap a chosen one to take it back. */
function Order({ q, a, onChange }: { q: Extract<Question, { type: "order" }>; a: Answers[string]; onChange: (v: string[]) => void }) {
  const chosen = Array.isArray(a) ? a : [];
              const pool = q.tiles.filter((t) => !chosen.includes(t));
              const sentence = q.joinWith !== null;
              return (
                <div className="mt-4">
                  <div className={`min-h-[64px] rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 ${sentence ? "flex flex-wrap gap-2" : "space-y-2"}`}>
                    {chosen.length === 0 && <p className="text-sm text-slate-400">Tap below to build your answer here…</p>}
                    {chosen.map((t, i) => (
                      <button key={t} type="button" onClick={() => onChange(chosen.filter((x) => x !== t))}
                        className={`rounded-lg bg-slate-800 px-3 py-2 text-left text-[15px] font-medium text-white ${sentence ? "" : "flex w-full items-start gap-2"}`}>
                        {!sentence && <span className="text-slate-400">{i + 1}.</span>}{t}
                      </button>
                    ))}
                  </div>
                  <p className="mb-2 mt-3 text-xs text-slate-500">{pool.length ? "Tap the next one:" : "Tap any of yours above to take it back out."}</p>
                  <div className={sentence ? "flex flex-wrap gap-2" : "space-y-2"}>
                    {pool.map((t) => (
                      <button key={t} type="button" onClick={() => onChange([...chosen, t])}
                        className={`rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-left text-[15px] font-medium text-slate-800 active:bg-slate-100 ${sentence ? "" : "w-full"}`}>{t}</button>
                    ))}
                  </div>
                </div>
              );
}

export function LiteracyTest({ token }: { token: string }) {
  const [state, setState] = useState<State>("loading");
  const [badReason, setBadReason] = useState<string | null>(null);
  const [info, setInfo] = useState<{ company: string; firstName: string; minutes: number; questionCount: number; marks: number }>({ company: "", firstName: "", minutes: 20, questionCount: 0, marks: 20 });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);

  const latest = useRef<Answers>({});
  const deadline = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishing = useRef(false);

  const post = useCallback((action: "load" | "begin" | "save" | "finish" | "left", answers?: Answers) => literacyAction(token, action, answers), [token]);

  const enterRunning = (json: { questions: unknown; answers: unknown; secondsLeft: number }) => {
    setQuestions(json.questions as Question[]);
    latest.current = (json.answers ?? {}) as Answers;
    setAnswers(latest.current);
    deadline.current = Date.now() + json.secondsLeft * 1000;
    setLeft(json.secondsLeft);
    setState("running");
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const json: LiteracyReply = await post("load");
        if (!live) return;
        if (json.status === "bad") { setBadReason(json.error); setState("bad"); return; }
        if (json.status === "saved") return;
        setInfo((i) => ({ ...i, company: json.company, firstName: json.firstName, ...(json.status === "ready" ? { minutes: json.minutes, questionCount: json.questionCount, marks: json.marks } : {}) }));
        if (json.status === "done") setState("done");
        else if (json.status === "running") enterRunning(json);
        else setState("ready");
      } catch { if (live) setState("bad"); }
    })();
    return () => { live = false; };
  }, [post]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    // Keep trying: the answers are already saved on the server, so the worst
    // case is that the office's next look closes the attempt instead.
    for (let i = 0; i < 4; i++) {
      try { await post("finish", latest.current); break; } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setState("done");
    window.scrollTo({ top: 0 });
  }, [post]);

  // The countdown — and handing in when it reaches zero.
  useEffect(() => {
    if (state !== "running") return;
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) { clearInterval(tick); void finish(); }
    }, 500);
    return () => clearInterval(tick);
  }, [state, finish]);

  // Leaving the page while the test runs is counted (the office sees how often).
  useEffect(() => {
    if (state !== "running") return;
    const onHide = () => { if (document.visibilityState === "hidden") void post("left").catch(() => {}); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [state, post]);

  const save = useCallback(async () => {
    try {
      const json = await post("save", latest.current);
      setOffline(json.status === "bad");
      // Re-sync the display to the server's clock.
      if (json.status === "saved") deadline.current = Date.now() + json.secondsLeft * 1000;
    } catch { setOffline(true); }
  }, [post]);

  const setAnswer = (id: string, value: Answers[string]) => {
    setAnswers((prev) => { const next = { ...prev, [id]: value }; latest.current = next; return next; });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, 500);
  };

  const begin = async () => {
    setBusy(true);
    try {
      const json = await post("begin");
      if (json.status === "bad") { setBadReason(json.error); setState("bad"); return; }
      if (json.status === "done") { setState("done"); return; }
      if (json.status === "running") enterRunning(json);
    } catch { setBadReason("We couldn't start the test. Check your connection and scan the code again."); setState("bad"); }
    finally { setBusy(false); }
  };

  if (state === "loading") return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (state === "bad") {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10">
        <h1 className="text-xl font-semibold text-slate-900">This test can&apos;t be opened</h1>
        <p className="mt-2 text-sm text-slate-600">{badReason || "This test link has expired or is no longer valid. Ask the office for a new one."}</p>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg className="h-7 w-7" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4 10l4 4 8-8" /></svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">All done{info.firstName ? `, ${info.firstName}` : ""}</h1>
        <p className="mt-2 text-sm text-slate-600">Your answers have been handed in. {info.company || "The office"} will talk to you about the next step.</p>
      </div>
    );
  }
  if (state === "ready") {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{info.company || "Recruitment"}</p>
        <h1 className="mt-0.5 text-xl font-semibold text-slate-900">Reading and writing test</h1>
        <p className="mt-1 text-sm text-slate-600">Hi {info.firstName || "there"}. This is about everyday things a carer reads and writes — a care plan, a visit note, a medicine label.</p>
        <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
          <li className="flex gap-3"><span className="w-24 shrink-0 font-semibold text-slate-900">{info.minutes} minutes</span><span>The clock starts when you press Begin. It cannot be paused.</span></li>
          <li className="flex gap-3"><span className="w-24 shrink-0 font-semibold text-slate-900">{info.questionCount} questions</span><span>Mostly tapping the answer. You can go back and change any of them.</span></li>
          <li className="flex gap-3"><span className="w-24 shrink-0 font-semibold text-slate-900">On your own</span><span>No help, no dictionary, and please stay on this page until you finish.</span></li>
        </ul>
        <button type="button" disabled={busy} onClick={() => { void begin(); }} className="mt-8 w-full rounded-lg bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-50">{busy ? "Starting…" : "Begin"}</button>
        <p className="mt-3 text-center text-xs text-slate-400">It can only be taken once.</p>
      </div>
    );
  }

  const q = questions[index];
  const a = q ? answers[q.id] : undefined;
  const unanswered = questions.filter((x) => !answered(x, answers[x.id]));
  const low = left <= 60, warn = left <= 300;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">{review ? "Check your answers" : `Question ${index + 1} of ${questions.length}`}</p>
          <p className={`rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ${low ? "bg-red-600 text-white" : warn ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800"}`} role="timer" aria-live={low ? "assertive" : "off"}>{clock(left)}</p>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {questions.map((x, i) => (
            <button key={x.id} type="button" onClick={() => { setReview(false); setIndex(i); }} className={`h-1.5 flex-1 rounded-full ${!review && i === index ? "bg-slate-800" : answered(x, answers[x.id]) ? "bg-emerald-500" : "bg-slate-200"}`} tabIndex={-1} />
          ))}
        </div>
        {offline && <p className="mt-1.5 text-xs font-medium text-red-600">No connection — keep going, we&apos;ll save when it comes back.</p>}
      </header>

      <main className="flex-1 px-4 pb-28 pt-5">
        {review ? (
          <div>
            <p className="text-sm text-slate-600">{unanswered.length ? `${unanswered.length} question${unanswered.length === 1 ? " has" : "s have"} no answer yet. Tap one to go back to it.` : "Every question has an answer. Hand in when you are ready."}</p>
            <ul className="mt-4 grid grid-cols-5 gap-2">
              {questions.map((x, i) => (
                <li key={x.id}><button type="button" onClick={() => { setReview(false); setIndex(i); }} className={`w-full rounded-lg border py-3 text-sm font-semibold ${answered(x, answers[x.id]) ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-amber-400 bg-amber-50 text-amber-900"}`}>{i + 1}</button></li>
              ))}
            </ul>
          </div>
        ) : q ? (
          <div>
            {q.passage && (
              <div className="mb-4 rounded-xl border border-slate-300 bg-amber-50/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{q.passage.title}</p>
                <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate-900">{q.passage.text}</p>
              </div>
            )}
            <h2 className="text-lg font-semibold leading-snug text-slate-900">{q.prompt}</h2>

            {q.type === "choice" && (
              <div className="mt-4 space-y-2.5" role="radiogroup">
                {q.options.map((opt) => (
                  <button key={opt} type="button" role="radio" aria-checked={a === opt} onClick={() => setAnswer(q.id, opt)}
                    className={`w-full rounded-xl border-2 px-4 py-3.5 text-left text-[15px] font-medium ${a === opt ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-800"}`}>{opt}</button>
                ))}
              </div>
            )}

            {q.type === "tapWords" && <TapWords q={q} a={a} onChange={(v) => setAnswer(q.id, v)} />}

            {q.type === "spell" && (
              <div className="mt-4 space-y-4">
                {q.words.map((w, i) => {
                  const typed = Array.isArray(a) ? a : [];
                  return (
                    <label key={w} className="block">
                      <span className="text-sm text-slate-600">Written as <span className="rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-700 line-through">{w}</span> — it should be:</span>
                      {/* Every assist off: a phone that fixes the spelling for them is not a spelling test. */}
                      <input type="text" value={typed[i] ?? ""} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} inputMode="text" enterKeyHint="done"
                        onChange={(e) => { const next = q.words.map((_, n) => (n === i ? e.target.value : typed[n] ?? "")); setAnswer(q.id, next); }}
                        className="mt-1 w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-3 text-lg text-slate-900 focus:border-slate-700 focus:outline-none" />
                    </label>
                  );
                })}
              </div>
            )}

            {q.type === "order" && <Order q={q} a={a} onChange={(v) => setAnswer(q.id, v)} />}
          </div>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-3 px-4 py-3">
          {review ? (
            <>
              <button type="button" disabled={busy} onClick={() => setReview(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Back</button>
              <button type="button" disabled={busy} onClick={() => { void finish(); }} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Handing in…" : unanswered.length ? `Hand in anyway (${unanswered.length} blank)` : "Hand in"}</button>
            </>
          ) : (
            <>
              <button type="button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-40">Back</button>
              {index + 1 < questions.length
                ? <button type="button" onClick={() => setIndex((i) => i + 1)} className="flex-1 rounded-lg bg-slate-800 px-4 py-3 text-sm font-semibold text-white">Next</button>
                : <button type="button" onClick={() => setReview(true)} className="flex-1 rounded-lg bg-slate-800 px-4 py-3 text-sm font-semibold text-white">Check and hand in</button>}
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

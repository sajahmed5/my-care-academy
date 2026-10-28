"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, ListTree, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveProgressAction } from "@/app/learn/actions";
import { awardContentStarAction } from "@/app/learn/quiz-actions";
import { groupSections, type H5PBlock } from "@/lib/content";

// Isolate the impure clock read from the component/hook bodies.
const nowMs = () => Date.now();

// A hidden-tab save with nothing new to say is skipped — every app switch on a
// phone fires one — unless this much time-on-course has built up unsaved, so
// a carer who then closes the app loses at most this much of it.
const HIDDEN_SAVE_MIN_SECONDS = 60;

interface XapiEvent {
  getVerb?: () => string | undefined;
  data?: {
    statement?: {
      object?: { id?: string };
      result?: { success?: boolean; response?: string };
    };
  };
}
interface H5PGlobal {
  externalDispatcher?: {
    on: (event: string, cb: (e: XapiEvent) => void) => void;
  };
}
declare global {
  interface Window {
    H5P?: H5PGlobal;
  }
}

/**
 * Plays a course whose content is an ordered list of H5P packages ("pages"),
 * one per screen. A fresh start opens with an intro and a contents overview
 * ("intro" -> "contents" -> "course"); resuming part-way jumps straight back
 * into the content. Our own progress bar, Back/Next, a "Save & come back
 * later" button and a leave-prompt keep the learner's place safe.
 */
export interface CourseSummary {
  intro: string;
  points: string[];
}

export function H5PCoursePlayer({
  enrolmentId,
  courseId,
  title,
  description,
  summary,
  estimatedMinutes,
  pages,
  initialBlock,
}: {
  enrolmentId: string;
  courseId: string;
  title: string;
  description?: string;
  summary?: CourseSummary | null;
  estimatedMinutes?: number | null;
  pages: H5PBlock[];
  initialBlock: number;
}) {
  const router = useRouter();
  const total = pages.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef(nowMs());
  const startIndex = Math.min(Math.max(0, initialBlock), total - 1);
  const [index, setIndex] = useState(startIndex);
  const [reached, setReached] = useState(startIndex);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  // Resume (initialBlock > 0) skips the intro flow and drops straight into the
  // content; a fresh start walks through intro -> contents -> course.
  const [stage, setStage] = useState<"intro" | "contents" | "course">(
    startIndex > 0 ? "course" : "intro",
  );
  const [leaving, setLeaving] = useState(false);

  const sections = groupSections(pages);
  const currentSection = sections.find((s) => s.pages.includes(index));

  // Track which questions on the current page have been answered (by xAPI
  // object id) so we can require them before "Next".
  const answeredRef = useRef<Set<string>>(new Set());
  const [answeredCount, setAnsweredCount] = useState(0);

  // Progress = pages actually completed (moved past), not the page you're on —
  // so opening a course and sitting on page 1 reads 0%, not 1/total.
  const progressPct = Math.round((Math.max(reached, index) / total) * 100);

  const requiredQuestions = pages[index].questions ?? 0;
  // Only gate on a page the learner is reaching for the first time; revisiting
  // an earlier page (index < reached) never blocks navigation.
  const gated = requiredQuestions > 0 && index >= reached && answeredCount < requiredQuestions;

  // What the server last confirmed (it keeps the highest progress it has
  // seen), so a hidden-tab save can tell whether it has anything to add.
  const savedRef = useRef({
    block: startIndex,
    progress: Math.round((startIndex / total) * 100),
  });

  // Persist current position + progress (fire-and-forget; RLS scopes it).
  // `onlyIfChanged` skips the call when the position and progress match the
  // last successful save; the unsaved time carries over to the next one.
  const persist = useCallback(
    (pageIndex: number, done = false, onlyIfChanged = false) => {
      const newReached = Math.max(reached, pageIndex);
      setReached(newReached);
      const delta = Math.round((nowMs() - startRef.current) / 1000);
      const pct = done ? 100 : Math.round((newReached / total) * 100);
      const saved = savedRef.current;
      if (
        onlyIfChanged &&
        pageIndex === saved.block &&
        pct <= saved.progress &&
        delta < HIDDEN_SAVE_MIN_SECONDS
      ) {
        return;
      }
      startRef.current = nowMs();
      void saveProgressAction({
        enrolmentId,
        currentBlock: pageIndex,
        progress: pct,
        timeSpentDelta: delta,
      }).then((res) => {
        if (res.ok) {
          savedRef.current = {
            block: pageIndex,
            progress: Math.max(savedRef.current.progress, pct),
          };
        }
      });
    },
    [enrolmentId, total, reached],
  );

  // Dispatchers we've already hooked (parent + each page's iframe), so we don't
  // attach the same handler twice.
  const attachedRef = useRef<Set<object>>(new Set());
  // In-content questions we've already tried to bank a star for this session, so
  // a re-answer doesn't re-hit the server (the DB unique constraint is the real
  // guard across visits). Session-wide — deliberately NOT reset per page.
  const starAwardedRef = useRef<Set<string>>(new Set());
  // Record a distinct answered/completed interaction on the current page, and —
  // when the answer is correct — bank a star for it (once).
  const onXapi = useCallback(
    (e: XapiEvent) => {
      const verb = e.getVerb?.();
      if (verb !== "answered" && verb !== "completed") return;
      const statement = e.data?.statement;
      const id = statement?.object?.id ?? `q-${answeredRef.current.size}`;
      // Only count a check that carries a real response — clicking "Check" with
      // nothing selected must not satisfy the Next gate. H5P joins response parts
      // with the "[,]" delimiter (MultiChoice indices, DragText drops), so an
      // empty answer looks like "[,][,][,]" not "". Strip the delimiters and
      // check for actual content.
      const response = statement?.result?.response;
      const hasAnswer =
        typeof response === "string" &&
        response.replace(/\[,\]/g, "").trim() !== "";
      if (hasAnswer && !answeredRef.current.has(id)) {
        answeredRef.current.add(id);
        setAnsweredCount(answeredRef.current.size);
      }
      // Star for a correct in-content answer (H5P sets result.success).
      if (
        statement?.result?.success === true &&
        statement.object?.id &&
        !starAwardedRef.current.has(statement.object.id)
      ) {
        const key = statement.object.id;
        starAwardedRef.current.add(key);
        void awardContentStarAction({ courseId, questionKey: key }).then((res) => {
          if (res.delta !== 1) return;
          const rect = containerRef.current?.getBoundingClientRect();
          const origin = rect
            ? { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 200) }
            : undefined;
          window.dispatchEvent(
            new CustomEvent("mca:award-stars", { detail: { count: 1, origin } }),
          );
        });
      }
    },
    [courseId],
  );

  // (Re)mount the H5P package whenever the page changes — but only once the
  // learner is actually in the content (not on the intro/contents screens).
  useEffect(() => {
    if (stage !== "course") return;
    let disposed = false;
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    // Reset the answered-question tracker for the new page.
    answeredRef.current = new Set();
    setAnsweredCount(0);
    setLoading(true);

    // Each page mounts a fresh H5P (often inside a new iframe), so hook the
    // xAPI dispatcher on both the parent and this page's iframe, retrying while
    // the iframe's H5P initialises. The retry stops once both are hooked (or,
    // for content mounted without an iframe, once it has loaded): nothing new
    // turns up on this page after that, and the next page re-runs this effect.
    let loaded = false;
    const attach = () => {
      const iframe = el.querySelector("iframe") as HTMLIFrameElement | null;
      const outer = window.H5P?.externalDispatcher;
      const inner = iframe?.contentWindow?.H5P?.externalDispatcher;
      for (const d of [outer, inner]) {
        if (d && !attachedRef.current.has(d)) {
          attachedRef.current.add(d);
          d.on("xAPI", onXapi);
        }
      }
      if (loaded && outer && (!iframe || inner)) clearInterval(attachTimer);
    };
    const attachTimer = setInterval(attach, 200);

    (async () => {
      try {
        const { H5P } = await import("h5p-standalone");
        if (disposed) return;
        await new H5P(el, {
          h5pJsonPath: `/h5p/content/${pages[index].path}`,
          librariesPath: "/h5p/libraries",
          frameJs: "/h5p/assets/frame.bundle.js",
          frameCss: "/h5p/assets/styles/h5p.css",
          // The site's teal on buttons, gaps and picked answers, not H5P's
          // blue, and room on reading pages. /h5p/assets is cached for a
          // week, so bump ?v= whenever mca-theme.css changes or carers keep
          // the old one.
          customCss: "/h5p/assets/styles/mca-theme.css?v=2",
        });
        if (!disposed) {
          setLoading(false);
          loaded = true;
          attach();
        }
      } catch (err) {
        console.error("H5P load failed", err);
        if (!disposed) {
          setLoading(false);
          loaded = true;
          attach();
        }
      }
    })();
    return () => {
      disposed = true;
      clearInterval(attachTimer);
      // Tear down the H5P iframe explicitly. h5p-standalone's iframe can
      // otherwise linger in the DOM when we leave the content for the summary
      // screen (the next effect run early-returns before it clears `el`).
      el.innerHTML = "";
    };
  }, [index, pages, onXapi, stage]);

  // Best-effort save if the learner leaves mid-page — skipped when nothing has
  // moved since the last save, as every app switch on a phone lands here.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") persist(index, false, true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [index, persist]);

  function goTo(next: number) {
    setIndex(next);
    persist(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function next() {
    if (index < total - 1) goTo(index + 1);
    else {
      // Tear down the H5P iframe while its container is still mounted. React
      // reuses this DOM node for the summary view and would otherwise carry the
      // (untracked) h5p-standalone iframe along, leaving it bleeding through.
      if (containerRef.current) containerRef.current.innerHTML = "";
      persist(total - 1, true);
      setFinished(true);
    }
  }

  function saveAndExit() {
    persist(index);
    router.push("/learn");
  }

  // Realistic per-course estimate (from content word count); falls back to a
  // rough pages-based figure when the course has no computed duration yet.
  const estMinutes = estimatedMinutes ?? Math.max(10, Math.round(total * 2));

  // ---- Intro screen (fresh start only) ---------------------------------
  if (stage === "intro") {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Link
          href="/learn"
          className="-my-2 inline-flex min-h-11 items-center py-2 text-sm text-muted-foreground hover:underline"
        >
          ← My training
        </Link>
        <div className="space-y-5 rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Course
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          </div>

          {description && (
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold">About this course</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">What you&apos;ll cover</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {sections.map((s, i) => (
                <li key={`${s.title}-${s.start}`} className="flex items-center gap-2 text-sm">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span>{s.title}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
            <span>
              {total} pages · about {estMinutes} min
            </span>
            <Button onClick={() => setStage("contents")}>Next →</Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Contents overview (fresh start only) ----------------------------
  if (stage === "contents") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Link
            href="/learn"
            className="-my-2 inline-flex min-h-11 items-center py-2 hover:underline"
          >
            ← My training
          </Link>
          {/* The Contents button lives here in the player — point it out so
              learners know where to reopen this list later. */}
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 font-medium text-foreground shadow-sm ring-2 ring-primary/40">
              <ListTree className="size-3.5" />
              Contents
            </span>
            <span className="pointer-events-none absolute right-3 top-full mt-1 flex flex-col items-center text-primary motion-safe:animate-bounce">
              <ArrowUp className="size-4" />
              <span className="whitespace-nowrap text-[11px] font-medium">Find it here</span>
            </span>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border bg-card p-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">What this course covers</h2>
            <p className="text-sm text-muted-foreground">
              You can reopen this list from the <strong>Contents</strong> button
              at the top right at any time.
            </p>
          </div>

          <ol className="space-y-3">
            {sections.map((s) => (
              <li key={`${s.title}-${s.start}`}>
                <h3 className="text-sm font-semibold text-primary">{s.title}</h3>
                <ul className="mt-1 space-y-0.5">
                  {s.pages.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                      <span>{pages[p].label ?? `Page ${p + 1}`}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          <div className="flex items-center justify-between border-t pt-4">
            <Button variant="outline" onClick={() => setStage("intro")}>
              Back
            </Button>
            <Button onClick={() => setStage("course")}>Begin course →</Button>
          </div>
        </div>
      </div>
    );
  }

  // Course summary — shown once the content is finished. The module isn't
  // complete until the assessment is passed, so the wording says so and the
  // primary action is to start it.
  if (finished) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <div className="space-y-2 text-center">
          <div className="text-4xl">🎉</div>
          <h2 className="text-2xl font-semibold">You&apos;ve completed the content</h2>
          <p className="text-muted-foreground">
            Nice work working through <strong>{title}</strong>. Here&apos;s a quick
            recap — then take the assessment to earn your certificate.
          </p>
        </div>

        {summary && (
          <div className="space-y-4 rounded-2xl border bg-card p-6">
            <h3 className="text-lg font-semibold">What you covered</h3>
            {summary.intro && (
              <p className="text-sm text-muted-foreground">{summary.intro}</p>
            )}
            <ul className="space-y-2.5">
              {summary.points.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          You&apos;re not finished yet — pass the assessment to complete this
          course and earn your certificate.
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => router.push(`/learn/courses/${courseId}/quiz`)}>
            Start assessment
          </Button>
          <Button variant="outline" onClick={() => router.push("/learn")}>
            Back to my training
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Header + progress bar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setLeaving(true)}
            className="-my-2 inline-flex min-h-11 items-center py-2 hover:underline"
          >
            ← My training
          </button>
          <div className="flex min-w-0 items-center gap-3">
            {/* min-w-0 + shrink-0 so a long page title truncates instead of
                shoving Contents off the side of a phone screen. */}
            <span className="min-w-0 truncate">
              {pages[index].label ?? `Page ${index + 1}`} · {index + 1} of {total}
            </span>
            <button
              type="button"
              onClick={() => setContentsOpen((o) => !o)}
              aria-expanded={contentsOpen}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1 font-medium text-foreground transition hover:shadow-sm sm:min-h-0"
            >
              {contentsOpen ? <X className="size-3.5" /> : <ListTree className="size-3.5" />}
              Contents
            </button>
          </div>
        </div>

        {currentSection && sections.length > 1 && (
          <p className="text-sm font-medium text-primary">
            {currentSection.title}
          </p>
        )}

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Contents — what's done, where you are, what's left. Pages you have
          not reached stay locked so the question gating can't be skipped. */}
      {contentsOpen && (
        <nav className="rounded-2xl border bg-card p-4 shadow-sm">
          <ul className="space-y-4">
            {sections.map((section) => {
              const done = section.pages.filter((p) => p < reached).length;
              const isCurrent = section.pages.includes(index);
              return (
                <li key={`${section.title}-${section.start}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3
                      className={`text-sm font-semibold ${isCurrent ? "text-primary" : ""}`}
                    >
                      {section.title}
                    </h3>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {done}/{section.pages.length}
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {section.pages.map((p) => {
                      const visited = p <= reached;
                      const isNow = p === index;
                      return (
                        <li key={p}>
                          <button
                            type="button"
                            disabled={!visited}
                            onClick={() => {
                              goTo(p);
                              setContentsOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                              isNow
                                ? "bg-primary/10 font-medium text-primary"
                                : visited
                                  ? "hover:bg-muted"
                                  : "cursor-not-allowed text-muted-foreground/60"
                            }`}
                          >
                            {p < reached ? (
                              <Check className="size-3.5 shrink-0 text-emerald-600" />
                            ) : visited ? (
                              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                            ) : (
                              <Lock className="size-3 shrink-0" />
                            )}
                            <span className="truncate">
                              {pages[p].label ?? `Page ${p + 1}`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {loading && (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">
          Loading…
        </div>
      )}

      {/* h5p-standalone mounts the current page here — in a card, like the
          rest of the app, rather than loose on the page (the room inside it
          comes from mca-theme.css). */}
      <div ref={containerRef} className="h5p-mount overflow-hidden rounded-2xl border bg-card shadow-sm" />

      {/* Answer-required hint */}
      {gated && !loading && (
        <p className="text-center text-sm font-medium text-amber-600">
          Answer the question{requiredQuestions > 1 ? "s" : ""} on this page to
          continue ({answeredCount}/{requiredQuestions} answered).
        </p>
      )}

      {/* Navigation + save */}
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button variant="outline" onClick={() => goTo(index - 1)} disabled={index === 0}>
          Back
        </Button>
        <Button variant="ghost" onClick={saveAndExit}>
          Save &amp; come back later
        </Button>
        <Button onClick={next} disabled={gated}>
          {index < total - 1 ? "Next" : "Next: summary"}
        </Button>
      </div>

      {/* Leave-prompt: reassure the learner their place is kept when they head
          back to their training list. */}
      {leaving && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-title"
          onClick={() => setLeaving(false)}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="leave-title" className="text-lg font-semibold">
              Leave this course?
            </h3>
            <p className="text-sm text-muted-foreground">
              We&apos;ll save your place at <strong>{pages[index].label ?? `page ${index + 1}`}</strong>{" "}
              — you can pick up right where you left off.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLeaving(false)}>
                Keep going
              </Button>
              <Button onClick={saveAndExit}>Save &amp; leave</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

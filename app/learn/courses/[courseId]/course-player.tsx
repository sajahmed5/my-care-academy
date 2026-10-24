"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BlockRenderer } from "@/components/content/block-renderer";
import { blockLabel, type ContentBlock } from "@/lib/content";
import { saveProgressAction } from "@/app/learn/actions";

// Isolated so the impure clock read stays out of the component/hook bodies.
const nowMs = () => Date.now();

// A hidden-tab save with nothing new to say is skipped — every app switch on a
// phone fires one — unless this much time-on-course has built up unsaved, so
// a carer who then closes the app loses at most this much of it.
const HIDDEN_SAVE_MIN_SECONDS = 60;

export function CoursePlayer({
  enrolmentId,
  courseId,
  title,
  blocks,
  initialBlock,
}: {
  enrolmentId: string;
  courseId: string;
  title: string;
  blocks: ContentBlock[];
  initialBlock: number;
}) {
  const router = useRouter();
  const total = blocks.length;
  const [index, setIndex] = useState(
    Math.min(Math.max(0, initialBlock), Math.max(0, total - 1)),
  );
  const [finished, setFinished] = useState(false);
  const startRef = useRef(nowMs());
  // What the server last confirmed (it keeps the highest progress it has
  // seen), so a hidden-tab save can tell whether it has anything to add.
  const savedRef = useRef({
    block: index,
    progress: total > 0 ? Math.round((index / total) * 100) : 0,
  });

  // `onlyIfChanged` skips the call when the position and progress match the
  // last successful save; the unsaved time carries over to the next one.
  const persist = useCallback(
    (nextIndex: number, done = false, onlyIfChanged = false) => {
      const delta = Math.round((nowMs() - startRef.current) / 1000);
      // Progress = pages completed (moved past), so being on page 1 reads 0%.
      const reached = Math.max(nextIndex, index);
      const pct = done ? 100 : Math.round((reached / total) * 100);
      const saved = savedRef.current;
      if (
        onlyIfChanged &&
        nextIndex === saved.block &&
        pct <= saved.progress &&
        delta < HIDDEN_SAVE_MIN_SECONDS
      ) {
        return;
      }
      startRef.current = nowMs();
      // Fire-and-forget; RLS ensures it only touches this learner's row.
      void saveProgressAction({
        enrolmentId,
        currentBlock: nextIndex,
        progress: pct,
        timeSpentDelta: delta,
      }).then((res) => {
        if (res.ok) {
          savedRef.current = {
            block: nextIndex,
            progress: Math.max(savedRef.current.progress, pct),
          };
        }
      });
    },
    [enrolmentId, index, total],
  );

  // Best-effort save if the tab is hidden/closed mid-course — skipped when
  // nothing has moved since the last save, as every app switch lands here.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden") persist(index, false, true);
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [index, persist]);

  if (total === 0) {
    return (
      <p className="text-muted-foreground">
        This course has no content yet.
      </p>
    );
  }

  const block = blocks[index];
  const pct = Math.round((index / total) * 100);

  function next() {
    if (index < total - 1) {
      const n = index + 1;
      setIndex(n);
      persist(n);
    } else {
      persist(total - 1, true);
      setFinished(true);
    }
  }

  function back() {
    if (index > 0) {
      const n = index - 1;
      setIndex(n);
      persist(n);
    }
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <h2 className="text-2xl font-semibold">Content complete</h2>
        <p className="text-muted-foreground">
          You&apos;ve worked through all of <strong>{title}</strong>. Now take the
          assessment to earn your certificate.
        </p>
        <div className="flex justify-center gap-3">
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/learn" className="hover:underline">
            ← My training
          </Link>
          <span>
            {blockLabel(block)} · {index + 1} of {total}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="min-h-[220px] rounded-xl border p-6">
        <BlockRenderer block={block} />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={back} disabled={index === 0}>
          Back
        </Button>
        <Button onClick={next}>
          {index < total - 1 ? "Next" : "Finish"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/learner-ui";
import { variantFor, ctaFor } from "@/app/learn/modules/course-card";
import { topicTheme } from "@/lib/topic-theme";
import { selfEnrolAction } from "@/app/learn/actions";
import type { ProgrammeStandard } from "@/lib/programmes";

/**
 * The 16-standard grid. A standard the learner is not enrolled on shows a
 * "Start this standard" button that self-enrols (via the same service-role
 * action the catalogue uses) then links straight into the player.
 */
export function StandardGrid({ standards }: { standards: ProgrammeStandard[] }) {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [justEnrolled, setJustEnrolled] = useState<Set<string>>(new Set());

  async function start(courseId: string) {
    setEnrolling(courseId);
    const res = await selfEnrolAction(courseId);
    if (res.ok) setJustEnrolled((prev) => new Set(prev).add(courseId));
    // Navigate into the course either way — if they were already enrolled the
    // action is a no-op and the player still opens.
    router.push(`/learn/courses/${courseId}`);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {standards.map((s) => {
        const theme = topicTheme(s.topic);
        const enrolled = s.status !== "not_enrolled" || justEnrolled.has(s.courseId);
        const assessmentDue = s.status !== "completed" && s.progress >= 100;
        return (
          <div
            key={s.standardNo}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                style={{ backgroundColor: `${theme.color}1a`, color: theme.color }}
              >
                {s.certificated || s.status === "completed" ? (
                  <Check className="size-4" />
                ) : (
                  s.standardNo
                )}
              </span>
              <StatusPill variant={variantFor(s.status, s.progress, s.dueDate)} />
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Standard {s.standardNo}
              </p>
              <p className="font-semibold leading-snug">{s.courseTitle}</p>
            </div>

            {enrolled && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${s.progress}%`, backgroundColor: theme.color }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{s.progress}%</span>
              </div>
            )}

            {s.observationStatus !== undefined && (
              <p className="text-xs text-muted-foreground">
                Workplace assessment:{" "}
                {s.observationStatus === "competent" ? (
                  <span className="font-medium text-emerald-600">observed</span>
                ) : s.observationStatus === "not_yet_competent" ? (
                  <span className="font-medium text-rose-600">not yet competent</span>
                ) : (
                  <span>awaiting observation</span>
                )}
              </p>
            )}

            <div className="mt-auto flex gap-2">
              {enrolled ? (
                <Link
                  href={
                    assessmentDue
                      ? `/learn/courses/${s.courseId}/quiz`
                      : `/learn/courses/${s.courseId}`
                  }
                  className={buttonVariants({ size: "sm", className: "flex-1" })}
                >
                  {ctaFor(s.status, s.progress)}
                </Link>
              ) : (
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={enrolling === s.courseId}
                  onClick={() => start(s.courseId)}
                >
                  {enrolling === s.courseId ? "Starting…" : "Start this standard"}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { CourseThumb } from "@/components/learner-ui";
import { cn } from "@/lib/utils";
import { topicTheme, tint } from "@/lib/topic-theme";
import { selfEnrolAction } from "@/app/learn/actions";
import { formatDate } from "@/lib/dates";

export interface CatalogueCourse {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
}

/** "22 Jul 2026" — compact enough to sit in a pill beside the topic label. */
function shortDate(iso: string): string {
  return formatDate(iso, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AllCourses({
  courses,
  enrolledIds,
  completedAt = {},
  initialQuery = "",
}: {
  courses: CatalogueCourse[];
  enrolledIds: string[];
  /** course id -> date the course was completed (null if we have no certificate). */
  completedAt?: Record<string, string | null>;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [topic, setTopic] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(new Set(enrolledIds));
  const [busy, setBusy] = useState<string | null>(null);

  const topics = [...new Set(courses.map((c) => c.topic).filter(Boolean))] as string[];

  const filtered = courses.filter((c) => {
    if (topic && c.topic !== topic) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q)
    );
  });

  async function enrol(id: string) {
    setBusy(id);
    const res = await selfEnrolAction(id);
    setBusy(null);
    if (res.ok) setEnrolled((prev) => new Set(prev).add(id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTopic(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              topic === null ? "bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            All
          </button>
          {topics.map((t) => {
            const theme = topicTheme(t);
            const active = topic === t;
            return (
              <button
                key={t}
                onClick={() => setTopic(active ? null : t)}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={
                  active
                    ? { backgroundColor: theme.color, color: "white", borderColor: theme.color }
                    : { backgroundColor: tint(theme.color), color: theme.color, borderColor: "transparent" }
                }
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((c) => {
          const isEnrolled = enrolled.has(c.id);
          const isCompleted = c.id in completedAt;
          const doneOn = completedAt[c.id];
          return (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
            >
              <CourseThumb topic={c.topic} />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {c.topic ?? "General"}
                </span>
                {isCompleted ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                    <Check className="size-3" />
                    {doneOn ? shortDate(doneOn) : "Completed"}
                  </span>
                ) : (
                  isEnrolled && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Enrolled
                    </span>
                  )
                )}
              </div>
              <p className="font-semibold leading-snug">{c.title}</p>
              {c.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {c.description}
                </p>
              )}
              <div className="mt-auto">
                {isCompleted ? (
                  // Still a link — completed courses stay open to review.
                  // cn() so twMerge drops the variant's bg-primary; passing the
                  // colour through buttonVariants' own className would leave
                  // both classes and let stylesheet order decide.
                  <Link
                    href={`/learn/courses/${c.id}`}
                    className={cn(
                      buttonVariants({ size: "sm" }),
                      "w-full bg-violet-600 text-white hover:bg-violet-700",
                    )}
                  >
                    Completed
                  </Link>
                ) : isEnrolled ? (
                  <Link
                    href={`/learn/courses/${c.id}`}
                    className={cn(
                      buttonVariants({ size: "sm" }),
                      "w-full bg-emerald-600 text-white hover:bg-emerald-700",
                    )}
                  >
                    Go to course
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => enrol(c.id)}
                    disabled={busy === c.id}
                  >
                    {busy === c.id ? "Enrolling…" : "Enrol"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No courses match.</p>
      )}
    </div>
  );
}

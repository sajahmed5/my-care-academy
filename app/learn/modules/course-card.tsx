import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  CourseThumb,
  StatusPill,
  type StatusVariant,
} from "@/components/learner-ui";
import { topicTheme } from "@/lib/topic-theme";
import { formatDate } from "@/lib/dates";
import { isOverdue } from "@/lib/engine-logic";

const nowMs = () => Date.now();

export interface CourseCardData {
  courseId: string;
  title: string;
  topic: string | null;
  status?: string;
  progress?: number;
  dueDate?: string | null;
}

export function variantFor(
  status: string,
  progress: number,
  dueDate?: string | null,
): StatusVariant {
  if (status === "not_enrolled") return "not_enrolled";
  if (status === "completed") return "completed";
  if (status === "expired") return "retake";
  // Overdue says so even once started: "In progress" on a course past its
  // date hid the one thing the carer most needed to know.
  if (isOverdue(dueDate ?? null, status, new Date(nowMs()))) return "overdue";
  // Content finished but the course isn't complete → the assessment is outstanding.
  if (progress >= 100) return "assessment_due";
  if (status === "in_progress") return "in_progress";
  return "assigned";
}

/** The call-to-action label for a course in the learner's current state. */
export function ctaFor(status: string, progress: number): string {
  if (status === "completed") return "Review";
  if (status === "expired") return "Redo";
  if (status !== "completed" && progress >= 100) return "Take assessment";
  if (progress > 0) return "Resume";
  return "Start";
}

export function CourseCard({ c }: { c: CourseCardData }) {
  const theme = topicTheme(c.topic);
  const status = c.status ?? "not_started";
  const progress = c.progress ?? 0;
  const assessmentDue = status !== "completed" && progress >= 100;
  const cta = ctaFor(status, progress);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <CourseThumb topic={c.topic} />

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {c.topic ?? "General"}
        </span>
        <StatusPill variant={variantFor(status, progress, c.dueDate)} />
      </div>

      <p className="font-semibold leading-snug">{c.title}</p>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{ width: `${progress}%`, backgroundColor: theme.color }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{progress}%</span>
      </div>

      {c.dueDate && status !== "completed" && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5" />
          Due {formatDate(c.dueDate)}
        </p>
      )}

      <div className="mt-auto flex gap-2">
        <Link
          href={
            assessmentDue
              ? `/learn/courses/${c.courseId}/quiz`
              : `/learn/courses/${c.courseId}`
          }
          className={buttonVariants({ size: "sm", className: "flex-1" })}
        >
          {cta}
        </Link>
        {!assessmentDue && (
          <Link
            href={`/learn/courses/${c.courseId}/quiz`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Assessment
          </Link>
        )}
      </div>
    </div>
  );
}

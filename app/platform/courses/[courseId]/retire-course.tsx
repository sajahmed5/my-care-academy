"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { retireCourseAction, restoreCourseAction } from "@/app/platform/course-actions";

/**
 * Retire a course, or bring it back (Saj, 30 Oct 2026). Confirms first and
 * says what goes: the unfinished assignments, at how many companies.
 */
export function RetireCourse({
  courseId,
  title,
  retiredAt,
  unfinished,
}: {
  courseId: string;
  title: string;
  retiredAt: string | null;
  unfinished: { assignments: number; companies: number };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const retire = () => {
    const loss =
      unfinished.assignments === 0
        ? "Nobody has it assigned and unfinished."
        : `${unfinished.assignments} unfinished ${unfinished.assignments === 1 ? "assignment" : "assignments"} at ${unfinished.companies} ${unfinished.companies === 1 ? "company" : "companies"} will be removed, with any progress on them.`;
    if (!window.confirm(`Retire ${title}?\n\n${loss} Certificates and completions are kept.\n\nBringing it back later won't restore the removed assignments.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await retireCourseAction(courseId);
      if (!res.ok) setError(res.error ?? "Could not retire the course.");
    });
  };

  const restore = () => {
    setError(null);
    startTransition(async () => {
      const res = await restoreCourseAction(courseId);
      if (!res.ok) setError(res.error ?? "Could not bring the course back.");
    });
  };

  return (
    <div className="space-y-2">
      {retiredAt ? (
        <Button variant="outline" onClick={restore} disabled={pending}>
          {pending ? "Bringing it back…" : "Bring it back"}
        </Button>
      ) : (
        <Button variant="destructive" onClick={retire} disabled={pending}>
          {pending ? "Retiring…" : "Retire this course"}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

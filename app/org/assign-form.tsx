"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { assignTrainingAction, type AssignState } from "./actions";
import { formatDate } from "@/lib/dates";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export interface AssignOption {
  id: string;
  title: string;
}
export interface StaffOption {
  id: string;
  name: string;
}

export function AssignForm({
  courses: coursesIn,
  pathways,
  staff: staffIn,
  defaultDueDate,
}: {
  courses: AssignOption[];
  pathways: AssignOption[];
  staff: StaffOption[];
  /** Pre-filled due date (end of the current month). Due dates are mandatory. */
  defaultDueDate: string;
}) {
  // Alphabetical lists are easier to scan (design doc v2).
  const courses = [...coursesIn].sort((a, b) => a.title.localeCompare(b.title));
  const staff = [...staffIn].sort((a, b) => a.name.localeCompare(b.name));
  const [state, formAction, pending] = useActionState(
    assignTrainingAction,
    {} as AssignState,
  );
  const [allCarers, setAllCarers] = useState(false);
  const [courseQuery, setCourseQuery] = useState("");
  const [staffQuery, setStaffQuery] = useState("");
  const [coursesPicked, setCoursesPicked] = useState(0);
  const [staffPicked, setStaffPicked] = useState(0);
  const staffBox = useRef<HTMLDivElement>(null);
  const courseBox = useRef<HTMLDivElement>(null);

  const match = (text: string, q: string) =>
    text.toLowerCase().includes(q.trim().toLowerCase());

  /** Count what's ticked — including rows currently hidden by a search. */
  function recount(box: HTMLDivElement | null, name: string, set: (n: number) => void) {
    const ticked = box?.querySelectorAll<HTMLInputElement>(
      `input[name="${name}"]:checked`,
    );
    set(ticked?.length ?? 0);
  }

  function toggleAllStaff(checked: boolean) {
    staffBox.current
      ?.querySelectorAll<HTMLInputElement>('input[name="userIds"]')
      .forEach((cb) => (cb.checked = checked));
    recount(staffBox.current, "userIds", setStaffPicked);
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pathway">A set of courses (optional)</Label>
          <select id="pathway" name="pathway" className={selectClass} defaultValue="">
            <option value="">None</option>
            {pathways.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            required
            defaultValue={defaultDueDate}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Courses</Label>
          <span className="text-xs text-muted-foreground">
            {coursesPicked === 0 ? "None picked" : `${coursesPicked} picked`}
          </span>
        </div>
        {/* Scrolling a 50-item checkbox well to find one course was the
            slowest part of assigning anything. */}
        <input
          type="search"
          value={courseQuery}
          onChange={(e) => setCourseQuery(e.target.value)}
          placeholder="Search courses…"
          aria-label="Search courses"
          className="min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9"
        />
        <div
          ref={courseBox}
          onChange={() => recount(courseBox.current, "courseIds", setCoursesPicked)}
          className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2"
        >
          {courses.map((c) => (
            <label
              key={c.id}
              hidden={!match(c.title, courseQuery)}
              className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0"
            >
              <input type="checkbox" name="courseIds" value={c.id} className="size-4" />
              {c.title}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Pick one or more courses (and/or a set of courses above). Searching only
          hides rows — anything already ticked stays ticked.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>
            Assign to{" "}
            <span className="font-normal text-muted-foreground">
              {allCarers
                ? "— all carers"
                : staffPicked === 0
                  ? "— nobody picked yet"
                  : `— ${staffPicked} picked`}
            </span>
          </Label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium sm:min-h-0">
            <input
              type="checkbox"
              name="all"
              checked={allCarers}
              onChange={(e) => {
                setAllCarers(e.target.checked);
                toggleAllStaff(e.target.checked);
              }}
            />
            All carers
          </label>
        </div>
        {!allCarers && (
          <input
            type="search"
            value={staffQuery}
            onChange={(e) => setStaffQuery(e.target.value)}
            placeholder="Search carers…"
            aria-label="Search carers"
            className="min-h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9"
          />
        )}
        <div
          ref={staffBox}
          onChange={() => recount(staffBox.current, "userIds", setStaffPicked)}
          className={`grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2 ${
            allCarers ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {staff.map((s) => (
            <label
              key={s.id}
              hidden={!match(s.name, staffQuery)}
              className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0"
            >
              <input type="checkbox" name="userIds" value={s.id} className="size-4" />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Assigning…" : "Assign training"}
        </Button>
        {state.error && (
          <span className="text-sm text-destructive">{state.error}</span>
        )}
        {state.ok && (
          <span className="text-sm text-green-700 dark:text-green-500">
            Assigned {state.courses} {state.courses === 1 ? "course" : "courses"} to{" "}
            {state.learners} {state.learners === 1 ? "carer" : "carers"}
            {state.dueDate
              ? `, due ${formatDate(state.dueDate, {
                  day: "numeric",
                  month: "long",
                })}`
              : ""}
            .{" "}
            <Link href="/org/learners/statistics?status=not_started" className="underline">
              See their training
            </Link>
          </span>
        )}
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { isAssessmentDue } from "@/lib/engine-logic";
import {
  dateColumn,
  newestFirst,
  numberColumn,
  statusRank,
  textColumn,
  type SortColumn,
} from "@/lib/table-sort";
import { useActionState, useState } from "react";
import { SortHeader, useTableSort } from "@/components/sort-header";
import { bulkDueDateAction, bulkUnassignAction, type BulkEnrolmentState } from "./actions";
import { formatDate } from "@/lib/dates";

export interface TrainingRow {
  userId: string;
  courseId: string;
  learner: string;
  course: string;
  status: string;
  progress: number;
  /** Certificate issue date = the completion date; enrolments have none. */
  completedAt: string | null;
  assignedAt: string | null;
  dueDate: string | null;
  overdue: boolean;
  late: boolean;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-green-100 text-green-700" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-700" },
  assessment_due: { label: "Assessment due", cls: "bg-indigo-100 text-indigo-700" },
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-700" },
  expired: { label: "Expired", cls: "bg-rose-100 text-rose-700" },
};

type SortKey = "learner" | "course" | "status" | "progress" | "assigned" | "due";

const SORT_COLUMNS: Record<SortKey, SortColumn<TrainingRow>> = {
  learner: textColumn((r) => r.learner),
  course: textColumn((r) => r.course),
  // Stage first (overdue on top); within a stage, the latest completed on top.
  status: {
    first: "asc",
    value: (r) => statusRank(r.status, r.overdue, isAssessmentDue(r.status, r.progress)),
    tieBreak: newestFirst((r) => r.completedAt),
  },
  progress: numberColumn((r) => (r.status === "completed" ? 100 : r.progress)),
  assigned: dateColumn((r) => r.assignedAt),
  due: dateColumn((r) => r.dueDate),
};

const HEADINGS: { key: SortKey; label: string }[] = [
  { key: "learner", label: "Learner" },
  { key: "course", label: "Course" },
  { key: "status", label: "Status" },
  { key: "progress", label: "Progress" },
  { key: "assigned", label: "Assigned" },
  { key: "due", label: "Due" },
];

/** Completed and expired training is a record — it can't be unassigned. */
const removable = (r: TrainingRow) => r.status !== "completed" && r.status !== "expired";

/**
 * The assigned-training table, with sortable headings (issue #40) and
 * tick-boxes for the two things that used to take one page visit per row:
 * taking a course back off people, and moving a deadline (7 Oct 2026).
 */
export function AssignedTrainingRows({ rows }: { rows: TrainingRow[] }) {
  const { sorted, sort, toggle } = useTableSort(rows, SORT_COLUMNS);
  const shown = sorted;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState("");
  const [unassignState, unassignAction, unassigning] = useActionState(
    bulkUnassignAction,
    {} as BulkEnrolmentState,
  );
  const [dueState, dueAction, changingDue] = useActionState(
    bulkDueDateAction,
    {} as BulkEnrolmentState,
  );

  const rowKey = (r: TrainingRow) => `${r.userId}:${r.courseId}`;
  const togglePick = (k: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const pickedRows = shown.filter((r) => picked.has(rowKey(r)));
  const keepCount = pickedRows.filter((r) => !removable(r)).length;

  function confirmUnassign(e: React.FormEvent) {
    const n = pickedRows.filter(removable).length;
    const warn =
      `Unassign ${n} ${n === 1 ? "assignment" : "assignments"}? ` +
      "Any progress on them is deleted." +
      (keepCount > 0
        ? ` ${keepCount} completed or expired ${keepCount === 1 ? "one is" : "ones are"} part of the training record and will be left alone.`
        : "");
    if (!window.confirm(warn)) e.preventDefault();
  }

  const result = unassignState.ok
    ? `Unassigned ${unassignState.changed}${unassignState.refused ? `, left ${unassignState.refused} completed or expired` : ""}.`
    : dueState.ok
      ? `Due date changed on ${dueState.changed}${dueState.refused ? `, left ${dueState.refused} completed` : ""}.`
      : (unassignState.error ?? dueState.error ?? null);

  return (
    <div className="space-y-3">
      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3">
          <span className="text-sm font-medium">
            {picked.size} selected
          </span>
          <form action={unassignAction} onSubmit={confirmUnassign} className="contents">
            {pickedRows.map((r) => (
              <input key={rowKey(r)} type="hidden" name="pairs" value={rowKey(r)} />
            ))}
            <button
              type="submit"
              disabled={unassigning || pickedRows.filter(removable).length === 0}
              className="inline-flex min-h-11 items-center rounded-full border border-destructive/40 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50 sm:min-h-9"
            >
              {unassigning ? "Unassigning…" : "Unassign selected"}
            </button>
          </form>
          <form action={dueAction} className="flex flex-wrap items-center gap-2">
            {pickedRows.map((r) => (
              <input key={rowKey(r)} type="hidden" name="pairs" value={rowKey(r)} />
            ))}
            <label className="text-sm" htmlFor="bulk-due">
              Change due date to
            </label>
            <input
              id="bulk-due"
              type="date"
              name="dueDate"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="min-h-11 rounded-lg border px-2 text-sm sm:min-h-9"
            />
            <button
              type="submit"
              disabled={changingDue || !dueDate}
              className="inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50 sm:min-h-9"
            >
              {changingDue ? "Saving…" : "Apply"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="min-h-11 text-sm text-muted-foreground hover:underline sm:min-h-0"
          >
            Clear
          </button>
          {keepCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {keepCount} completed or expired — those stay as a record
            </span>
          )}
        </div>
      )}
      {result && <p className="text-sm text-muted-foreground">{result}</p>}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select every row shown"
                  className="size-4"
                  checked={shown.length > 0 && picked.size === shown.length}
                  onChange={(e) =>
                    setPicked(e.target.checked ? new Set(shown.map(rowKey)) : new Set())
                  }
                />
              </th>
              {HEADINGS.map((h) => (
                <SortHeader
                  key={h.key}
                  label={h.label}
                  active={sort?.key === h.key}
                  dir={sort?.dir}
                  onClick={() => toggle(h.key)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Nothing here.
                </td>
              </tr>
            ) : (
              shown.map((r, i) => {
                const key = isAssessmentDue(r.status, r.progress)
                  ? "assessment_due"
                  : r.status;
                const badge = STATUS_BADGE[key] ?? {
                  label: r.status,
                  cls: "bg-slate-100 text-slate-700",
                };
                return (
                  <tr
                    key={`${r.userId}-${r.course}-${i}`}
                    className="border-b last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.learner} — ${r.course}`}
                        className="size-4"
                        checked={picked.has(rowKey(r))}
                        onChange={() => togglePick(rowKey(r))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/org/staff/${r.userId}`}
                        className="font-medium hover:underline"
                      >
                        {r.learner}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.course}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        {r.overdue && r.status !== "completed" && (
                          <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                            Overdue
                          </span>
                        )}
                        {r.late && (
                          <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                            Late
                          </span>
                        )}
                      </span>
                      {/* When it was finished, next to the status (issue #23). */}
                      {r.completedAt && (
                        <span className="block whitespace-nowrap text-xs text-muted-foreground">
                          {fmtDate(r.completedAt)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.status === "completed" ? "100%" : `${r.progress}%`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {fmtDate(r.assignedAt)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={
                          r.overdue
                            ? "font-medium text-rose-600"
                            : "text-muted-foreground"
                        }
                      >
                        {fmtDate(r.dueDate)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

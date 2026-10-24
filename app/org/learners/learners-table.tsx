"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { NudgeButton } from "../nudge-button";
import { SortHeader, useTableSort } from "@/components/sort-header";
import { dateColumn, numberColumn, textColumn, type SortColumn } from "@/lib/table-sort";
import {
  bucketOf,
  isInactive30d,
  isNeverActive,
  type OrgLearnerRow,
} from "@/lib/org-learners";
import { formatDate } from "@/lib/dates";

const DAY = 86_400_000;

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function lastActive(d: string | null): { label: string; stale: boolean } {
  if (!d) return { label: "Never", stale: true };
  const days = Math.floor((Date.now() - new Date(d).getTime()) / DAY);
  const stale = days > 30;
  if (days <= 0) return { label: "Today", stale };
  if (days === 1) return { label: "Yesterday", stale };
  if (days < 30) return { label: `${days} days ago`, stale };
  return { label: fmtDate(d), stale };
}

export type Filter =
  | "all"
  | "overdue"
  | "in_progress"
  | "not_started"
  | "completed"
  | "unassigned"
  | "deactivated"
  | "inactive"
  | "never"
  | "due_soon"
  | "signed_in";

const STATUS_FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "in_progress", label: "In progress" },
  { key: "not_started", label: "Not started" },
  { key: "completed", label: "Completed" },
  { key: "unassigned", label: "Nothing assigned" },
];

// Activity and account status are separate lenses, not part of the status
// breakdown. Inactive 30d+ means "has logged in, but not for 30+ days" —
// never-active users have their own pill (issue #15).
const ACTIVITY_FILTERS: { key: Filter; label: string }[] = [
  { key: "due_soon", label: "Due in 60 days" },
  { key: "signed_in", label: "Has signed in" },
  { key: "inactive", label: "Not signed in for a month" },
  { key: "never", label: "Never active" },
  { key: "deactivated", label: "Deactivated" },
];

type SortKey =
  | "learner" | "progress" | "assigned" | "completed" | "inProgress"
  | "notStarted" | "overdue" | "latest" | "lastAssigned" | "lastActive";

const SORT_COLUMNS: Record<SortKey, SortColumn<OrgLearnerRow>> = {
  learner: textColumn((r) => r.name),
  progress: numberColumn((r) => r.stats.overallPct),
  assigned: numberColumn((r) => r.stats.assigned),
  completed: numberColumn((r) => r.stats.completed),
  inProgress: numberColumn((r) => r.stats.inProgress),
  notStarted: numberColumn((r) => r.stats.notStarted),
  overdue: numberColumn((r) => r.stats.overdue),
  latest: dateColumn((r) => r.latestCompleted?.date ?? null),
  lastAssigned: dateColumn((r) => r.lastAssignedAt),
  lastActive: dateColumn((r) => r.lastSeenAt),
};

const HEADINGS: { key: SortKey; label: string }[] = [
  { key: "learner", label: "Learner" },
  { key: "progress", label: "Progress" },
  { key: "assigned", label: "Assigned" },
  { key: "completed", label: "Completed" },
  { key: "inProgress", label: "In progress" },
  { key: "notStarted", label: "Not started" },
  { key: "overdue", label: "Overdue" },
  { key: "latest", label: "Latest completed" },
  { key: "lastAssigned", label: "Last assigned" },
  { key: "lastActive", label: "Last active" },
];

function matches(r: OrgLearnerRow, f: Filter): boolean {
  // Deactivated accounts (leavers — the rostering portal archived them) are
  // kept for their training history, but they belong under All/Deactivated
  // only: surfacing a leaver as "overdue" or "never active" invites someone
  // to chase a person who can no longer log in.
  if (r.status === "deactivated") return f === "all" || f === "deactivated";
  switch (f) {
    case "deactivated":
      return false; // handled by the short-circuit above
    case "inactive":
      return isInactive30d(r);
    case "never":
      return isNeverActive(r);
    // Matches the dashboard's "due in the next 60 days" sentence exactly —
    // the two used to disagree about who they meant.
    case "due_soon":
      return r.stats.dueSoon > 0;
    case "signed_in":
      return !isNeverActive(r);
    case "all":
      return true;
    default:
      return bucketOf(r) === f;
  }
}

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

export function LearnersTable({
  rows,
  filename = "learners-overview.csv",
  initialFilter = "all",
  readOnly = false,
}: {
  rows: OrgLearnerRow[];
  filename?: string;
  /** Pre-selected filter pill (deep links like ?filter=overdue). */
  initialFilter?: Filter;
  /** Platform view: hide the org-admin-only Remind action. */
  readOnly?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");
  // Searching by name or email: with 60+ carers the filter pills aren't
  // enough, and every other table in the console already had a search box.
  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = rows.filter((r) => matches(r, filter));
    if (!needle) return matching;
    return matching.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.email ?? "").toLowerCase().includes(needle),
    );
  }, [rows, filter, query]);
  const { sorted: shown, sort, toggle } = useTableSort(found, SORT_COLUMNS);

  function exportCsv() {
    const header = [
      "Learner",
      "Status",
      "Email",
      "Assigned",
      "Completed",
      "In progress",
      "Not started",
      "Overdue",
      "Overall %",
      "Latest completed",
      "Completed on",
      "Last assigned",
      "Last active",
    ];
    const body = shown.map((r) =>
      [
        r.name,
        r.status === "deactivated" ? "Deactivated" : "Active",
        r.email ?? "",
        String(r.stats.assigned),
        String(r.stats.completed),
        String(r.stats.inProgress),
        String(r.stats.notStarted),
        String(r.stats.overdue),
        `${r.stats.overallPct}%`,
        r.latestCompleted?.title ?? "",
        r.latestCompleted ? fmtDate(r.latestCompleted.date) : "",
        fmtDate(r.lastAssignedAt),
        r.lastSeenAt ? fmtDate(r.lastSeenAt) : "Never",
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = "﻿" + [header.map(csvCell).join(","), ...body].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email…"
          aria-label="Search learners by name or email"
          className="min-h-11 w-full rounded-full border px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9 sm:w-64"
        />
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => {
            const count = rows.filter((r) => matches(r, f.key)).length;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1 text-sm transition-colors sm:min-h-0 ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-accent"
                }`}
              >
                {f.label}{" "}
                <span className={active ? "opacity-80" : "text-muted-foreground"}>
                  {count}
                </span>
              </button>
            );
          })}
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          {ACTIVITY_FILTERS.map((f) => {
            const count = rows.filter((r) => matches(r, f.key)).length;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex min-h-11 items-center rounded-full border border-dashed px-3 py-1 text-sm transition-colors sm:min-h-0 ${
                  active
                    ? "border-solid border-foreground bg-foreground text-background"
                    : "hover:bg-accent"
                }`}
              >
                {f.label}{" "}
                <span className={active ? "opacity-80" : "text-muted-foreground"}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Phones: one card per carer. The table needs ~1,000px, and the
          Remind button was its last column — furthest from the thumb. */}
      <ul className="space-y-2 md:hidden">
        {shown.length === 0 ? (
          <li className="rounded-2xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {query ? `Nobody matches "${query}".` : "No learners match this filter."}
          </li>
        ) : (
          shown.map((r) => {
            const active = lastActive(r.lastSeenAt);
            const gone = r.status === "deactivated";
            return (
              <li key={r.id} className={`rounded-2xl border bg-card p-4 ${gone ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/org/staff/${r.id}`} className="block truncate font-medium hover:underline">
                      {r.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                  </div>
                  <span className="shrink-0 text-lg font-semibold">{r.stats.overallPct}%</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{r.stats.assigned} assigned</span>
                  <span>{r.stats.completed} done</span>
                  {r.stats.overdue > 0 && (
                    <span className="font-semibold text-rose-600">{r.stats.overdue} overdue</span>
                  )}
                  <span className={active.stale ? "text-rose-600" : ""}>
                    {active.label === "Never" ? "never signed in" : `seen ${active.label.toLowerCase()}`}
                  </span>
                </div>
                {!readOnly && !gone && (
                  <div className="mt-3">
                    <NudgeButton userId={r.id} lastRemindedAt={r.lastRemindedAt} />
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {HEADINGS.map((h) => (
                <SortHeader
                  key={h.key}
                  label={h.label}
                  active={sort?.key === h.key}
                  dir={sort?.dir}
                  onClick={() => toggle(h.key)}
                />
              ))}
              {!readOnly && (
                <th className="px-3 py-2 text-right font-medium">Action</th>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 10 : 11} className="px-3 py-8 text-center text-muted-foreground">
                  {query ? `Nobody matches "${query}".` : "No learners match this filter."}
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const active = lastActive(r.lastSeenAt);
                const gone = r.status === "deactivated";
                return (
                  <tr
                    key={r.id}
                    className={`border-b last:border-0 hover:bg-accent/40 ${gone ? "opacity-60" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/org/staff/${r.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                      {gone && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.stats.overdue > 0
                            ? "bg-rose-100 text-rose-700"
                            : r.stats.assigned > 0 && r.stats.completed === r.stats.assigned
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.stats.overallPct}%
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.stats.assigned}</td>
                    <td className="px-3 py-2">{r.stats.completed}</td>
                    <td className="px-3 py-2">{r.stats.inProgress}</td>
                    <td className="px-3 py-2">{r.stats.notStarted}</td>
                    <td className="px-3 py-2">
                      {r.stats.overdue > 0 ? (
                        <span className="font-medium text-rose-600">
                          {r.stats.overdue}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.latestCompleted ? (
                        <span>
                          {r.latestCompleted.title}
                          <span className="block text-xs">
                            {fmtDate(r.latestCompleted.date)}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {fmtDate(r.lastAssignedAt)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={active.stale ? "text-rose-600" : "text-muted-foreground"}>
                        {active.label}
                      </span>
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2 text-right">
                        {/* Nothing to chase a leaver about, nor someone who
                            has finished everything assigned to them — but
                            someone who has never signed in is always worth a
                            nudge, even with nothing assigned yet (issue #27). */}
                        {!gone &&
                        (isNeverActive(r) || r.stats.completed < r.stats.assigned) ? (
                          <NudgeButton
                            userId={r.id}
                            size="xs"
                            lastRemindedAt={r.lastRemindedAt}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex min-h-11 items-center rounded-lg border px-3 py-1 text-sm font-medium transition-colors hover:bg-accent sm:min-h-0"
        >
          Export these {shown.length} rows
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { SortHeader, useTableSort } from "@/components/sort-header";
import { Pill } from "@/components/pill";
import { initials } from "@/lib/initials";
import { dateColumn, numberColumn, textColumn, type SortColumn } from "@/lib/table-sort";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  filterLabel,
  lastActiveLabel,
  matches,
  matchesQuery,
  MORE_FILTERS,
  roleLine,
  SEGMENTS,
  type Filter,
  type StaffRow,
} from "@/lib/staff-list";

export type { Filter, StaffRow } from "@/lib/staff-list";

const fmtDate = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

type SortKey = "name" | "training" | "supervision" | "appraisal" | "lastActive";

const SORT_COLUMNS: Record<SortKey, SortColumn<StaffRow>> = {
  name: textColumn((r) => r.name),
  training: numberColumn((r) => r.stats.overallPct),
  supervision: numberColumn((r) => r.supervision?.order ?? 9),
  appraisal: numberColumn((r) => r.appraisal?.order ?? 9),
  lastActive: dateColumn((r) => r.lastSeenAt),
};

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** A colour per person for the avatar, steady across visits. */
const AVATAR = [
  "bg-indigo-100 text-indigo-800",
  "bg-pink-100 text-pink-800",
  "bg-teal-100 text-teal-800",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
];
function avatarClass(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

/**
 * Everyone on the staff, one row each (docs/redesign image 3): training as
 * a bar, supervision and appraisal as pills, when they were last here, and
 * the whole row opens their file. Four segments across the top; the rest of
 * the filters behind one button. On a phone the table scrolls sideways.
 */
export function LearnersTable({
  rows,
  filename = "staff.csv",
  initialFilter = "all",
  initialQuery = "",
  readOnly = false,
}: {
  rows: StaffRow[];
  filename?: string;
  /** Pre-selected filter (deep links like ?filter=overdue). */
  initialFilter?: Filter;
  /** Typed into the search in the top bar (?q=). */
  initialQuery?: string;
  /** Platform view: another organisation's staff, read only. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  // Fixed for the life of the table, so the rows don't shift mid-sort.
  const [now] = useState(() => Date.now());
  const hasChecks = rows.some((r) => r.supervision || r.appraisal);

  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const found = useMemo(() => rows.filter((r) => matches(r, filter, now) && matchesQuery(r, query)), [rows, filter, query, now]);
  const { sorted: shown, sort, toggle } = useTableSort(found, SORT_COLUMNS);
  const count = (f: Filter) => rows.filter((r) => matches(r, f, now)).length;
  const moreActive = MORE_FILTERS.some((m) => m.key === filter);
  const profile = (r: StaffRow) => (readOnly ? null : `/org/staff/${r.id}`);

  function exportCsv() {
    const header = ["Name", "Role", "Email", "Status", "Training %", "Assigned", "Completed", "Overdue", "Supervision", "Appraisal", "Last active"];
    const body = shown.map((r) =>
      [
        r.name,
        roleLine(r),
        r.email ?? "",
        r.status === "deactivated" ? "Left" : "Active",
        `${r.stats.overallPct}%`,
        String(r.stats.assigned),
        String(r.stats.completed),
        String(r.stats.overdue),
        r.supervision?.label ?? "",
        r.appraisal?.label ?? "",
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The four segments */}
        <div role="group" aria-label="Show" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SEGMENTS.map((s) => {
            const n = count(s.key);
            const active = filter === s.key;
            if (s.key === "deactivated" && n === 0) return null;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(s.key)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors",
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
                {s.key !== "deactivated" && <span className={active ? "text-muted-foreground" : "text-muted-foreground/70"}>· {n}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <span className="sr-only">Find a person</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a person"
              className="h-11 w-full rounded-xl border bg-card pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <div ref={moreRef} className="relative">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="true"
              onClick={() => setMoreOpen((o) => !o)}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors hover:bg-muted",
                moreActive ? "border-primary bg-accent text-accent-foreground" : "bg-card",
              )}
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">{moreActive ? filterLabel(filter) : "Filters"}</span>
              <span className="sm:hidden">{moreActive ? "1" : "Filters"}</span>
            </button>
            {moreOpen && (
              <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-xl">
                {["Training", "Activity"].map((group) => (
                  <div key={group} className="py-1">
                    <p className="px-3 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</p>
                    {MORE_FILTERS.filter((m) => m.group === group).map((m) => {
                      const n = count(m.key);
                      const active = filter === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            setFilter(m.key);
                            setMoreOpen(false);
                          }}
                          className={cn(
                            "flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm",
                            active ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted",
                          )}
                        >
                          {m.label}
                          <span className="text-muted-foreground">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {moreActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("all");
                      setMoreOpen(false);
                    }}
                    className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-xl border-t px-3 text-sm font-semibold text-primary hover:bg-muted"
                  >
                    <X className="size-4" />
                    Clear filter
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border bg-card">
        <table className="w-full min-w-[720px] text-[15px]">
          <thead>
            <tr className="border-b text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <SortHeader label="Name" active={sort?.key === "name"} dir={sort?.dir} onClick={() => toggle("name")} />
              <SortHeader label="Training" active={sort?.key === "training"} dir={sort?.dir} onClick={() => toggle("training")} />
              {hasChecks && <SortHeader label="Supervision" active={sort?.key === "supervision"} dir={sort?.dir} onClick={() => toggle("supervision")} />}
              {hasChecks && <SortHeader label="Appraisal" active={sort?.key === "appraisal"} dir={sort?.dir} onClick={() => toggle("appraisal")} />}
              <SortHeader label="Last active" active={sort?.key === "lastActive"} dir={sort?.dir} onClick={() => toggle("lastActive")} />
              <th className="w-10 p-0">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={hasChecks ? 6 : 4} className="px-4 py-12 text-center">
                  <p className="font-bold">{query ? `Nobody matches “${query}”` : filter === "all" ? "No staff yet" : `Nobody under “${filterLabel(filter)}”`}</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                    {filter === "all" && !query ? (
                      <>
                        Invite your staff and their training, supervisions and appraisals appear here.{" "}
                        <Link href="/org/learners/admin?section=invite" className="font-semibold text-primary hover:underline">
                          Add staff
                        </Link>
                      </>
                    ) : (
                      <>
                        Try another filter, or{" "}
                        <button type="button" onClick={() => { setFilter("all"); setQuery(""); }} className="font-semibold text-primary hover:underline">
                          show everyone
                        </button>
                        .
                      </>
                    )}
                  </p>
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const active = lastActiveLabel(r.lastSeenAt, now, fmtDate);
                const gone = r.status === "deactivated";
                const href = profile(r);
                const pct = r.stats.overallPct;
                const barTone = r.stats.overdue > 0 ? "bg-danger-foreground" : r.stats.assigned > 0 && pct < 80 ? "bg-amber-500" : "bg-primary";
                return (
                  <tr
                    key={r.id}
                    onClick={href ? () => router.push(href) : undefined}
                    className={cn("border-b last:border-0 transition-colors", href && "cursor-pointer hover:bg-muted/60", gone && "opacity-60")}
                  >
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-3">
                        <span aria-hidden className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarClass(r.id))}>
                          {initials(r.name, r.email)}
                        </span>
                        <span className="min-w-0">
                          {href ? (
                            <Link href={href} onClick={(e) => e.stopPropagation()} className="block truncate font-bold hover:underline">
                              {r.name}
                            </Link>
                          ) : (
                            <span className="block truncate font-bold">{r.name}</span>
                          )}
                          <span className="block truncate text-sm text-muted-foreground">
                            {gone ? "Left" : roleLine(r) || r.email}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-muted lg:w-36" role="presentation">
                          <div className={cn("h-full rounded-full", barTone)} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-11 font-bold tabular-nums">{pct}%</span>
                        {r.stats.overdue > 0 && <span className="sr-only">, {r.stats.overdue} overdue</span>}
                      </div>
                    </td>
                    {hasChecks && (
                      <td className="px-4 py-3 sm:px-5">
                        {r.supervision ? <Pill tone={r.supervision.tone}>{r.supervision.label}</Pill> : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    {hasChecks && (
                      <td className="px-4 py-3 sm:px-5">
                        {r.appraisal ? <Pill tone={r.appraisal.tone}>{r.appraisal.label}</Pill> : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    <td className={cn("whitespace-nowrap px-4 py-3 sm:px-5", active.stale ? "text-danger-foreground" : "text-muted-foreground")}>{active.label}</td>
                    <td className="px-3 py-3 text-muted-foreground">{href && <ChevronRight className="size-4" aria-hidden />}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {shown.length} of {rows.length} {rows.length === 1 ? "person" : "people"}
        </span>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-10 items-center rounded-xl border bg-card px-3.5 font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Export these {shown.length} rows
        </button>
      </div>
    </div>
  );
}

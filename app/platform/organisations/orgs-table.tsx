"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OrgEngagementRow } from "@/lib/platform-orgs";
import { tierLabel } from "@/lib/organisations";
import { OrgNudgeButton } from "../org-nudge-button";

const DAY = 86_400_000;

function fmtDate(d: string | null): string {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function lastActive(d: string | null): { label: string; stale: boolean } {
  if (!d) return { label: "Never", stale: true };
  const days = Math.floor((Date.now() - new Date(d).getTime()) / DAY);
  if (days <= 0) return { label: "Today", stale: false };
  if (days === 1) return { label: "Yesterday", stale: false };
  if (days < 30) return { label: `${days} days ago`, stale: false };
  return { label: fmtDate(d), stale: true };
}

type Filter = "all" | "dormant" | "low" | "suspended";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "dormant", label: "Dormant" },
  { key: "low", label: "Low completion" },
  { key: "suspended", label: "Suspended" },
];

function matches(r: OrgEngagementRow, f: Filter): boolean {
  switch (f) {
    case "dormant":
      return r.status !== "suspended" && r.dormant;
    case "low":
      return r.assigned > 0 && r.completionPct < 50;
    case "suspended":
      return r.status === "suspended";
    default:
      return true;
  }
}

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

export function OrgsTable({ rows }: { rows: OrgEngagementRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(() => rows.filter((r) => matches(r, filter)), [rows, filter]);

  function exportCsv() {
    const header = [
      "Organisation",
      "Tier",
      "Status",
      "Learners",
      "Assigned",
      "Completed",
      "Completion %",
      "Overdue",
      "Last active",
    ];
    const body = shown.map((r) =>
      [
        r.name,
        tierLabel(r.tier),
        r.status,
        String(r.learners),
        String(r.assigned),
        String(r.completed),
        `${r.completionPct}%`,
        String(r.overdue),
        r.lastActive ? fmtDate(r.lastActive) : "Never",
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = "﻿" + [header.map(csvCell).join(","), ...body].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "organisations-engagement.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const count = rows.filter((r) => matches(r, f.key)).length;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
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
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg border px-3 py-1 text-sm font-medium transition-colors hover:bg-accent"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Organisation</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">Learners</th>
              <th className="px-3 py-2 font-medium">Completion</th>
              <th className="px-3 py-2 font-medium">Overdue</th>
              <th className="px-3 py-2 font-medium">Last active</th>
              <th className="px-3 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No organisations match this filter.
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const active = lastActive(r.lastActive);
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="px-3 py-2">
                      <Link
                        href={`/platform/organisations/${r.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.status === "suspended" && (
                        <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                          suspended
                        </span>
                      )}
                      {r.status !== "suspended" && r.dormant && (
                        <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
                          dormant
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {tierLabel(r.tier)}
                      {r.outgrownBand && (
                        <span className="ml-2 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          outgrown band
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.learners}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.assigned === 0
                            ? "bg-slate-100 text-slate-500"
                            : r.completionPct >= 80
                              ? "bg-green-100 text-green-700"
                              : r.completionPct >= 50
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {r.assigned === 0 ? "—" : `${r.completionPct}%`}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.overdue}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={active.stale ? "text-rose-600" : "text-muted-foreground"}>
                        {active.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <OrgNudgeButton orgId={r.id} size="xs" />
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

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KIND_LABELS, REPORT_KINDS, REPORT_STATUSES, STATUS_LABELS, kindPillClass, statusPillClass } from "./status";
import { formatDate } from "@/lib/dates";

export interface ReportRow {
  id: string;
  report_no: number;
  kind: string | null;
  summary: string;
  reporter_email: string | null;
  reporter_role: string | null;
  page_path: string | null;
  status: string;
  created_at: string;
}

type Filter = "all" | (typeof REPORT_STATUSES)[number];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "reviewing", label: "Reviewing" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

type KindFilter = "all" | (typeof REPORT_KINDS)[number];

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-sm transition-colors ${
    active ? "border-foreground bg-foreground text-background" : "hover:bg-accent"
  }`;

function fmt(d: string): string {
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReportsTable({ rows }: { rows: ReportRow[] }) {
  // Default to the actionable set — open issues.
  const [filter, setFilter] = useState<Filter>("open");
  // And by kind (issue report 100), within the status chosen.
  const [kind, setKind] = useState<KindFilter>("all");
  const byStatus = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );
  const shown = useMemo(
    () => (kind === "all" ? byStatus : byStatus.filter((r) => (r.kind ?? "problem") === kind)),
    [byStatus, kind],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "all" ? rows.length : rows.filter((r) => r.status === f.key).length;
          const active = filter === f.key;
          return (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={chip(active)}>
              {f.label}{" "}
              <span className={active ? "opacity-80" : "text-muted-foreground"}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setKind("all")} className={chip(kind === "all")}>
          Every kind
        </button>
        {REPORT_KINDS.map((k) => {
          const count = byStatus.filter((r) => (r.kind ?? "problem") === k).length;
          return (
            <button key={k} type="button" onClick={() => setKind(k)} className={chip(kind === k)}>
              {KIND_LABELS[k]}{" "}
              <span className={kind === k ? "opacity-80" : "text-muted-foreground"}>{count}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No {filter === "all" ? "" : `${filter} `}
          {kind === "all" ? "issues" : `reports of the kind “${KIND_LABELS[kind]}”`}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">#</th>
                <th className="py-2 font-medium">Issue</th>
                <th className="py-2 font-medium">Reporter</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="py-2 pr-2 font-mono text-muted-foreground">
                    <Link href={`/platform/reports/${r.id}`} className="block">
                      {r.report_no}
                    </Link>
                  </td>
                  <td className="py-2 pr-2">
                    <Link
                      href={`/platform/reports/${r.id}`}
                      className="block font-medium hover:underline"
                    >
                      {r.summary}
                    </Link>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className={kindPillClass}>{KIND_LABELS[r.kind ?? "problem"] ?? r.kind}</span>
                      {r.page_path && <span className="truncate">{r.page_path}</span>}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">
                    {r.reporter_email ?? "—"}
                  </td>
                  <td className="py-2 pr-2">
                    <span className={statusPillClass(r.status)}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="py-2 whitespace-nowrap text-muted-foreground">
                    {fmt(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

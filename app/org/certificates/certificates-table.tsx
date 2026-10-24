"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { needsAttention, type CertState, type OrgCertificateRow } from "@/lib/certificates";
import { RenewButton } from "./renew-button";
import { formatDate } from "@/lib/dates";

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const BADGE: Record<CertState, { label: string; cls: string }> = {
  expired: { label: "Expired", cls: "bg-rose-100 text-rose-700" },
  due_30: { label: "Due ≤30 days", cls: "bg-amber-100 text-amber-800" },
  due_60: { label: "Due 31–60 days", cls: "bg-yellow-100 text-yellow-800" },
  valid: { label: "Valid", cls: "bg-green-100 text-green-700" },
  no_expiry: { label: "No expiry", cls: "bg-slate-100 text-slate-700" },
};

/** "expired 12 days ago" / "in 9 days" — the urgency in plain words. */
function whenText(r: OrgCertificateRow): string {
  if (r.daysLeft === null) return "Never expires";
  if (r.daysLeft < 0) {
    const n = Math.abs(r.daysLeft);
    return `${n} day${n === 1 ? "" : "s"} ago`;
  }
  if (r.daysLeft === 0) return "Today";
  return `in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`;
}

export function CertificatesTable({
  rows,
  filename = "certificates.csv",
}: {
  rows: OrgCertificateRow[];
  filename?: string;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.learner.toLowerCase().includes(needle) ||
        r.course.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  function exportCsv() {
    const header = [
      "Learner",
      "Course",
      "Certificate number",
      "Issued",
      "Expires",
      "Status",
      "Days remaining",
    ];
    const body = shown.map((r) =>
      [
        r.learner,
        r.course,
        r.number,
        fmtDate(r.issuedAt),
        fmtDate(r.expiresAt),
        BADGE[r.state].label,
        r.daysLeft === null ? "" : String(r.daysLeft),
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
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search carer or course…"
        aria-label="Search certificates by carer or course"
        className="min-h-11 w-full rounded-full border px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9 sm:w-72"
      />
      {/* Phones: a card per certificate, with the PDF link as the action. */}
      <ul className="space-y-2 md:hidden">
        {shown.length === 0 ? (
          <li className="rounded-2xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {query ? `Nothing matches "${query}".` : "Nothing here — no certificates match this filter."}
          </li>
        ) : (
          shown.map((r) => {
            const badge = BADGE[r.state];
            return (
              <li key={r.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block truncate font-medium">{r.course}</span>
                    <Link
                      href={`/org/staff/${r.userId}`}
                      className="block truncate text-xs text-muted-foreground hover:underline"
                    >
                      {r.learner}
                    </Link>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Issued {fmtDate(r.issuedAt)} · {r.expiresAt ? `expires ${fmtDate(r.expiresAt)} (${whenText(r)})` : "no expiry"}
                </p>
                <a
                  href={`/org/certificates/${r.id}/download`}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <Download className="size-4" />
                  Certificate (PDF)
                </a>
              </li>
            );
          })
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Learner</th>
              <th className="px-3 py-2 font-medium">Course</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Expires</th>
              <th className="px-3 py-2 font-medium">Issued</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {query ? `Nothing matches "${query}".` : "Nothing here — no certificates match this filter."}
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const badge = BADGE[r.state];
                return (
                  <tr
                    key={r.id}
                    className="border-b last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/org/staff/${r.userId}`}
                        className="font-medium hover:underline"
                      >
                        {r.learner}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="block font-medium">{r.course}</span>
                      {/* The download used to hide behind the course title,
                          with a tooltip as its only cue — invisible on a
                          phone. Same org-scoped route, now labelled. */}
                      <a
                        href={`/org/certificates/${r.id}/download`}
                        className="mt-0.5 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline sm:min-h-0"
                      >
                        <Download className="size-3.5" />
                        Certificate (PDF)
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fmtDate(r.expiresAt)}
                      <span
                        className={`block text-xs ${
                          r.state === "expired"
                            ? "text-rose-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {whenText(r)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {fmtDate(r.issuedAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {/* Nothing to chase on a certificate that is still in
                          date, or one that never expires. */}
                      {needsAttention(r) ? (
                        <RenewButton
                          certificateId={r.id}
                          learner={r.learner}
                          course={r.course}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
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
          className="rounded-lg border px-3 py-1 text-sm font-medium transition-colors hover:bg-accent"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}

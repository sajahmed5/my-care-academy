"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@/lib/dates";

export interface ReminderRow {
  id: string;
  toEmail: string;
  learnerName: string | null;
  subject: string;
  sent: boolean;
  createdAt: string;
  /** email_log.type — which kind of reminder this was. */
  type: string;
}

function fmt(d: string): string {
  return formatDateTime(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const KINDS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "org_nudge", label: "Training" },
  { key: "org_signin_nudge", label: "Sign-in" },
  { key: "org_renewal_nudge", label: "Renewal" },
];

/**
 * Every reminder the org has sent (issue #13), with a filter that filters.
 *
 * It previously had none, and the send-to-a-group picker sat directly above it
 * in the same card — so that picker read as this table's filter, and changing
 * it correctly did nothing to the rows below (issue #31). The picker has moved
 * out to its own card; the control that looks like it belongs to this table
 * now is one.
 */
export function RemindersTable({ rows }: { rows: ReminderRow[] }) {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.type !== kind) return false;
      if (!q) return true;
      return (
        (r.learnerName ?? "").toLowerCase().includes(q) ||
        r.toEmail.toLowerCase().includes(q)
      );
    });
  }, [rows, kind, query]);

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
        No reminders have been sent yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => {
          const count =
            k.key === "all"
              ? rows.length
              : rows.filter((r) => r.type === k.key).length;
          const active = kind === k.key;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-accent"
              }`}
            >
              {k.label}{" "}
              <span className={active ? "opacity-80" : "text-muted-foreground"}>
                {count}
              </span>
            </button>
          );
        })}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email…"
          className="ml-auto w-full max-w-56 rounded-lg border bg-background px-3 py-1 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Sent</th>
              <th className="px-3 py-2 font-medium">Learner</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No reminders match this filter.
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {fmt(r.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-medium">{r.learnerName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.toEmail}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.subject}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.sent
                          ? "bg-green-100 text-green-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {r.sent ? "Delivered" : "Failed"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { REQUIRED_DOCS, type DocState } from "@/lib/recruitment";

export interface CandidateRow {
  id: string;
  full_name: string;
  postcode: string | null;
  email: string | null;
  is_driver: boolean;
  entry_date: string;
  stage: string;
  status: string;
  /** Checklist state by document key; a key that is absent is missing. */
  docs: Record<string, DocState>;
}

const statusVariant: Record<string, "secondary" | "destructive"> = {
  hired: "secondary",
  rejected: "destructive",
  candidate: "secondary",
};

/** One cell of the checklist: held, not needed, expired, or nothing yet. */
function DocMark({ state }: { state: DocState | undefined }) {
  switch (state) {
    case "held":
      return <span className="text-green-600">✓</span>;
    case "not_required":
      return (
        <span className="text-xs text-muted-foreground" title="Not needed">
          N/A
        </span>
      );
    case "expired":
      return (
        <span className="text-destructive" title="Expired">
          ✗
        </span>
      );
    default:
      return <span className="text-muted-foreground">–</span>;
  }
}

export function RecruitmentTable({ candidates }: { candidates: CandidateRow[] }) {
  const [q, setQ] = useState("");

  const filtered = candidates.filter((c) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (
      c.full_name.toLowerCase().includes(t) ||
      (c.postcode ?? "").toLowerCase().includes(t) ||
      (c.email ?? "").toLowerCase().includes(t)
    );
  });

  return (
    <div className="space-y-4">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, postcode or email…"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No candidates.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="sticky left-0 bg-background py-2 pr-4 font-medium">
                  Candidate
                </th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Stage</th>
                <th className="py-2 pr-4 font-medium">Docs</th>
                {REQUIRED_DOCS.map((d) => (
                  <th
                    key={d.key}
                    className="py-2 pr-3 font-medium whitespace-nowrap text-xs"
                  >
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const done = REQUIRED_DOCS.filter((d) => {
                  const s = c.docs[d.key];
                  return s === "held" || s === "not_required";
                }).length;
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="sticky left-0 bg-background py-2 pr-4">
                      <Link
                        href={`/org/recruitment/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.full_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {c.postcode}
                        {c.is_driver ? " · driver" : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={statusVariant[c.status] ?? "secondary"}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{c.stage}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                      {done}/{REQUIRED_DOCS.length}
                    </td>
                    {REQUIRED_DOCS.map((d) => (
                      <td key={d.key} className="py-2 pr-3 text-center">
                        <DocMark state={c.docs[d.key]} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { REQUIRED_DOCS, docState, progressLabel, progressOf, type CandidateProgress, type DocState } from "@/lib/recruitment";
import { DocControls, DocStatus, type Doc } from "./doc-controls";

export interface CandidateRow {
  id: string;
  full_name: string;
  postcode: string | null;
  email: string | null;
  is_driver: boolean;
  entry_date: string;
  stage: string;
  status: string;
  /** Checklist rows by document key; a key that is absent is missing. */
  docs: Record<string, Doc>;
}

const progressVariant: Record<CandidateProgress, "default" | "secondary" | "destructive" | "outline"> = {
  applied: "outline",
  reviewing: "secondary",
  hired: "default",
  rejected: "destructive",
};

/** One cell of the checklist: held, not needed, expired, or nothing yet. */
function DocMark({ state }: { state: DocState }) {
  switch (state) {
    case "held":
      return <span className="text-green-600">✓</span>;
    case "not_required":
      return <span className="text-xs text-muted-foreground">N/A</span>;
    case "expired":
      return <span className="text-destructive">✗</span>;
    default:
      return <span className="text-muted-foreground">–</span>;
  }
}

/** The cell a manager has clicked: which candidate, which document. */
interface OpenCell {
  candidateId: string;
  docKey: string;
}

export function RecruitmentTable({ candidates }: { candidates: CandidateRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<OpenCell | null>(null);

  const filtered = candidates.filter((c) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (
      c.full_name.toLowerCase().includes(t) ||
      (c.postcode ?? "").toLowerCase().includes(t) ||
      (c.email ?? "").toLowerCase().includes(t)
    );
  });

  // A tick, a dash or an N/A is also a button: click it and the controls for
  // that one document appear above the table, so a manager can upload or mark
  // "not needed" without opening the candidate (Saj, 24 Oct 2026). The panel
  // sits outside the table because the table scrolls sideways.
  const openCandidate = open ? candidates.find((c) => c.id === open.candidateId) : undefined;
  const openDoc = open ? REQUIRED_DOCS.find((d) => d.key === open.docKey) : undefined;

  return (
    <div className="space-y-4">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, postcode or email…"
        className="max-w-sm"
      />

      {openCandidate && openDoc && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="min-w-40">
            <p className="text-sm font-medium">
              <Link href={`/org/recruitment/${openCandidate.id}`} className="hover:underline">
                {openCandidate.full_name}
              </Link>
              {" · "}
              {openDoc.label}
            </p>
            <DocStatus existing={openCandidate.docs[openDoc.key]} />
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <DocControls
              key={`${openCandidate.id}:${openDoc.key}`}
              candidateId={openCandidate.id}
              doc={openDoc}
              existing={openCandidate.docs[openDoc.key]}
              onChange={() => router.refresh()}
            />
            <Button size="xs" variant="ghost" onClick={() => setOpen(null)}>
              Close
            </Button>
          </div>
        </div>
      )}

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
                  const s = docState(c.docs[d.key]);
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
                      <Badge variant={progressVariant[progressOf(c)]}>
                        {progressLabel(progressOf(c))}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                      {done}/{REQUIRED_DOCS.length}
                    </td>
                    {REQUIRED_DOCS.map((d) => {
                      const isOpen = open?.candidateId === c.id && open.docKey === d.key;
                      return (
                        <td key={d.key} className="py-2 pr-3 text-center">
                          <button
                            type="button"
                            onClick={() => setOpen(isOpen ? null : { candidateId: c.id, docKey: d.key })}
                            title={`${c.full_name} · ${d.label}`}
                            aria-label={`${c.full_name}: ${d.label}`}
                            aria-expanded={isOpen}
                            className={cn(
                              "min-w-8 rounded px-1.5 py-0.5 hover:bg-muted",
                              isOpen && "bg-muted ring-2 ring-primary",
                            )}
                          >
                            <DocMark state={docState(c.docs[d.key])} />
                          </button>
                        </td>
                      );
                    })}
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

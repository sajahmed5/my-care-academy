"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  REQUIRED_DOCS,
  CANDIDATE_PROGRESS,
  docState,
  progressOf,
  outstandingDocs,
  type DocState,
  type RequiredDoc,
} from "@/lib/recruitment";
import { setCandidateProgressAction, deleteCandidateAction, hireCandidateAction } from "../actions";
import { DocControls, DocStatus, type Doc } from "../doc-controls";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  stage: string;
  status: string;
}
export type { Doc };

const STATE_CHIP: Record<DocState, { label: string; className: string }> = {
  held: { label: "Uploaded", className: "bg-green-100 text-green-700" },
  not_required: { label: "Not needed", className: "bg-muted text-muted-foreground" },
  missing: { label: "Required", className: "bg-rose-100 text-rose-700" },
  expired: { label: "Expired", className: "bg-rose-100 text-rose-700" },
};

/** One checklist item: its name and status, with the shared controls beside. */
function DocRow({
  candidateId,
  doc,
  existing,
  onChange,
}: {
  candidateId: string;
  doc: RequiredDoc;
  existing?: Doc;
  onChange: () => void;
}) {
  const state = docState(existing);
  const chip = STATE_CHIP[state];
  const owed = state === "missing" || state === "expired";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-40">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span>
            {doc.label}
            {owed && <span className="text-rose-600" aria-hidden> *</span>}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}>{chip.label}</span>
        </p>
        <DocStatus existing={existing} />
      </div>
      <DocControls candidateId={candidateId} doc={doc} existing={existing} onChange={onChange} />
    </div>
  );
}

export function CandidateDetail({
  candidate,
  documents,
}: {
  candidate: Candidate;
  documents: Doc[];
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<string>(progressOf(candidate));
  const [createLearner, setCreateLearner] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byType = new Map(documents.map((d) => [d.doc_type, d]));
  // Mark hired waits for the whole checklist (issue #51). The server checks
  // the same thing; this is so the manager can see what is in the way.
  const outstanding = outstandingDocs(documents);
  const hired = progress === "hired";

  // Saved as soon as it is chosen: one dropdown has no need of a Save button.
  async function changeProgress(next: string) {
    const before = progress;
    setProgress(next);
    setBusy(true);
    setError(null);
    const r = await setCandidateProgressAction(candidate.id, next);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save.");
      setProgress(before);
      return;
    }
    router.refresh();
  }

  async function hire() {
    setBusy(true);
    setError(null);
    const r = await hireCandidateAction(candidate.id, createLearner);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not mark hired.");
      return;
    }
    setProgress("hired");
    setMsg(
      r.invited
        ? "Marked hired and invited as a learner. Assign their courses from the Team page."
        : "Marked hired.",
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="cand-progress" className="text-xs">Status</Label>
          <select
            id="cand-progress"
            value={progress}
            onChange={(e) => changeProgress(e.target.value)}
            disabled={busy}
            className={selectClass}
          >
            {CANDIDATE_PROGRESS.map((p) => (
              <option key={p.value} value={p.value} disabled={p.value === "hired"}>
                {p.label}
                {p.value === "hired" && !hired ? " (use Mark hired)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Documents</p>
          <p className="text-xs text-muted-foreground">
            {REQUIRED_DOCS.length - outstanding.length} of {REQUIRED_DOCS.length} done
          </p>
        </div>
        {!hired && (
          <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            To mark someone hired, every document below must be uploaded (and in
            date where it expires) or marked not needed.{" "}
            {outstanding.length > 0 ? (
              <>
                Items marked <span className="text-rose-600">*</span> are still
                needed: {outstanding.length} to go.
              </>
            ) : (
              "Everything is in, so they can be hired."
            )}
          </p>
        )}
        <div className="grid gap-2">
          {REQUIRED_DOCS.map((d) => (
            <DocRow
              key={d.key}
              candidateId={candidate.id}
              doc={d}
              existing={byType.get(d.key)}
              onChange={() => router.refresh()}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createLearner}
              onChange={(e) => setCreateLearner(e.target.checked)}
            />
            Also create as a learner (assign courses separately)
          </label>
          <Button
            onClick={hire}
            disabled={busy || hired || outstanding.length > 0}
            title={outstanding.length > 0 ? "Complete the checklist first" : undefined}
          >
            Mark hired
          </Button>
          {msg && (
            <span className="text-sm text-green-700 dark:text-green-500">
              {msg}
            </span>
          )}
        </div>
        {!hired && outstanding.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Mark hired is available once every document is uploaded or marked
            not needed. Still outstanding:{" "}
            {outstanding
              .map((i) => (i.state === "expired" ? `${i.label} (expired)` : i.label))
              .join(", ")}
            .
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <form
        action={deleteCandidateAction.bind(null, candidate.id)}
        onSubmit={(e) => {
          // Hiring may have made them a learner, and that account is not the
          // candidate: it stays until it is deleted from Staff (#63).
          const hired =
            candidate.status === "hired"
              ? " Their staff account, if hiring created one, is not deleted with it — remove that from Staff."
              : "";
          if (
            !window.confirm(
              `Delete ${candidate.full_name}? This permanently removes the candidate and every document uploaded for them. This cannot be undone.${hired}`,
            )
          ) {
            e.preventDefault();
          }
        }}
        className="pt-2"
      >
        <Button type="submit" variant="destructive" size="sm">
          Delete candidate
        </Button>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  REQUIRED_DOCS,
  CANDIDATE_STAGES,
  CANDIDATE_STATUSES,
  docState,
  outstandingDocs,
} from "@/lib/recruitment";
import {
  updateCandidateAction,
  uploadDocumentAction,
  deleteDocumentAction,
  deleteCandidateAction,
  hireCandidateAction,
  getDocUrlAction,
  markDocumentNotRequiredAction,
} from "../actions";

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  stage: string;
  status: string;
}
export interface Doc {
  id: string;
  doc_type: string;
  file_name: string | null;
  file_path: string | null;
  expires_at: string | null;
  not_required: boolean;
  not_required_reason: string | null;
}

function readFile(file: File): Promise<{ name: string; dataUrl: string }> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, dataUrl: String(r.result) });
    r.readAsDataURL(file);
  });
}

/**
 * One checklist item. Three states: a file we hold (view / remove), "not
 * needed" with its reason (undo), or nothing yet — upload, or say it does not
 * apply (issue #52).
 */
function DocRow({
  candidateId,
  docKey,
  label,
  tracksExpiry,
  existing,
  onChange,
}: {
  candidateId: string;
  docKey: string;
  label: string;
  tracksExpiry?: boolean;
  existing?: Doc;
  onChange: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState(existing?.expires_at ?? "");
  const [waiving, setWaiving] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = docState(existing);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const payload = await readFile(file);
    const r = await uploadDocumentAction(candidateId, docKey, payload, expires || null);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not upload.");
      return;
    }
    setFile(null);
    onChange();
  }

  async function markNotRequired() {
    setBusy(true);
    setError(null);
    const r = await markDocumentNotRequiredAction(candidateId, docKey, reason);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save.");
      return;
    }
    setWaiving(false);
    setReason("");
    onChange();
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    await deleteDocumentAction(existing.id, candidateId);
    setBusy(false);
    onChange();
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-40">
          <p className="text-sm font-medium">{label}</p>
          {state === "not_required" ? (
            <p className="text-xs text-muted-foreground">
              Not needed
              {existing?.not_required_reason ? ` · ${existing.not_required_reason}` : ""}
            </p>
          ) : existing ? (
            <p className="text-xs text-muted-foreground">
              {existing.file_name}
              {existing.expires_at && (
                <span className={state === "expired" ? "text-destructive" : ""}>
                  {" "}
                  · {state === "expired" ? "expired" : "expires"}{" "}
                  {new Date(existing.expires_at).toLocaleDateString("en-GB")}
                </span>
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Not uploaded</p>
          )}
        </div>

        {state === "not_required" ? (
          <Button size="xs" variant="outline" disabled={busy} onClick={remove}>
            Undo
          </Button>
        ) : existing ? (
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={async () => {
                if (!existing.file_path) return;
                const { url } = await getDocUrlAction(existing.file_path);
                if (url) window.open(url, "_blank");
              }}
            >
              View
            </Button>
            <Button size="xs" variant="destructive" disabled={busy} onClick={remove}>
              Remove
            </Button>
          </div>
        ) : waiving ? null : (
          <div className="flex flex-wrap items-center gap-2">
            {tracksExpiry && (
              <Input
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                className="h-8 w-36"
                title="Expiry date"
              />
            )}
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="h-8 w-48 text-xs"
            />
            <Button size="xs" onClick={upload} disabled={busy || !file}>
              Upload
            </Button>
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => setWaiving(true)}>
              Not needed
            </Button>
          </div>
        )}
      </div>

      {waiving && state === "missing" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Why it is not needed (optional)"
            className="h-8 flex-1 min-w-48"
          />
          <Button size="xs" onClick={markNotRequired} disabled={busy}>
            Mark not needed
          </Button>
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => setWaiving(false)}>
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
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
  const [stage, setStage] = useState(candidate.stage);
  const [status, setStatus] = useState(candidate.status);
  const [createLearner, setCreateLearner] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byType = new Map(documents.map((d) => [d.doc_type, d]));
  // Mark hired waits for the whole checklist (issue #51). The server checks
  // the same thing; this is so the manager can see what is in the way.
  const outstanding = outstandingDocs(documents);
  const hired = status === "hired";

  async function saveMeta() {
    setBusy(true);
    setError(null);
    const r = await updateCandidateAction(candidate.id, { stage, status });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not save.");
      setStatus(candidate.status);
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
    setStatus("hired");
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
          <Label className="text-xs">Stage</Label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className={selectClass}
          >
            {CANDIDATE_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClass}
          >
            {CANDIDATE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={saveMeta} disabled={busy}>
          Save
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Documents</p>
          <p className="text-xs text-muted-foreground">
            {REQUIRED_DOCS.length - outstanding.length} of {REQUIRED_DOCS.length} done
          </p>
        </div>
        <div className="grid gap-2">
          {REQUIRED_DOCS.map((d) => (
            <DocRow
              key={d.key}
              candidateId={candidate.id}
              docKey={d.key}
              label={d.label}
              tracksExpiry={d.tracksExpiry}
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
        className="pt-2"
      >
        <Button type="submit" variant="destructive" size="sm">
          Delete candidate
        </Button>
      </form>
    </div>
  );
}

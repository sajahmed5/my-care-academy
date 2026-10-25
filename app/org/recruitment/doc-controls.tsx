"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { docState, type RequiredDoc } from "@/lib/recruitment";
import {
  uploadDocumentAction,
  deleteDocumentAction,
  getDocUrlAction,
  markDocumentNotRequiredAction,
} from "./actions";
import { formatDate } from "@/lib/dates";

/** One checklist row as the page receives it. */
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

/** The one-line status under a document's name: held, not needed, or nothing yet. */
export function DocStatus({ existing }: { existing?: Doc }) {
  const state = docState(existing);
  if (state === "not_required") {
    return (
      <p className="text-xs text-muted-foreground">
        Not needed
        {existing?.not_required_reason ? ` · ${existing.not_required_reason}` : ""}
      </p>
    );
  }
  if (!existing) return <p className="text-xs text-muted-foreground">Not uploaded</p>;
  return (
    <p className="text-xs text-muted-foreground">
      {existing.file_name}
      {existing.expires_at && (
        <span className={state === "expired" ? "text-destructive" : ""}>
          {" "}
          · {state === "expired" ? "expired" : "expires"}{" "}
          {formatDate(existing.expires_at)}
        </span>
      )}
    </p>
  );
}

/**
 * The controls for one checklist item, shared by the candidate page and the
 * tracker table. Three states: a file we hold (view / remove), "not needed"
 * with its reason (undo), or nothing yet — upload, or say it does not apply
 * (issue #52).
 */
export function DocControls({
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
    const r = await uploadDocumentAction(candidateId, doc.key, payload, expires || null);
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
    const r = await markDocumentNotRequiredAction(candidateId, doc.key, reason);
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {state === "not_required" ? (
          <Button size="xs" variant="outline" disabled={busy} onClick={remove}>
            Undo
          </Button>
        ) : existing ? (
          <>
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
            <Button
              size="xs"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Remove ${existing.file_name ?? "this file"}? The file is deleted and cannot be got back.`)) remove();
              }}
            >
              Remove
            </Button>
          </>
        ) : waiving ? null : (
          <>
            {doc.tracksExpiry && (
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
            {/* "Mark", not "Not needed": a bare "Not needed" on every row read as
                every row's status (#57). */}
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => setWaiving(true)}>
              Mark not needed…
            </Button>
          </>
        )}
      </div>

      {waiving && state === "missing" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Why it is not needed (optional)"
            className="h-8 min-w-48 flex-1"
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

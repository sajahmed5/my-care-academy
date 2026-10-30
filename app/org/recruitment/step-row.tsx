"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import type { StepState } from "@/lib/recruitment";
import {
  confirmStepAction,
  deleteDocumentAction,
  getDocUrlAction,
  markDocumentNotRequiredAction,
  sendBackStepAction,
  uploadDocumentAction,
} from "./actions";

/** One step as the page receives it: its definition, state and row. */
export interface StepView {
  key: string;
  label: string;
  hint: string;
  optionalNote?: string;
  tracksExpiry?: boolean;
  required: boolean;
  locked: boolean;
  state: StepState;
  /** Signed online and waiting for the office: accepted from the signed copy, not here. */
  signedHref?: string;
  /** What they sent in online, to read: the application form. */
  readHref?: string;
  doc?: {
    id: string;
    file_name: string | null;
    file_path: string | null;
    expires_at: string | null;
    not_required_reason: string | null;
    review_note: string | null;
    uploaded_by_candidate: boolean;
  };
}

const PILL: Record<StepState, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-muted text-muted-foreground" },
  submitted: { label: "Waiting on you", className: "bg-amber-100 text-amber-900" },
  sent_back: { label: "Sent back", className: "bg-slate-100 text-slate-700" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-800" },
  not_needed: { label: "Not needed", className: "bg-green-50 text-green-800" },
  expired: { label: "Expired", className: "bg-rose-100 text-rose-800" },
};

function readFile(file: File): Promise<{ name: string; dataUrl: string }> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, dataUrl: String(r.result) });
    r.readAsDataURL(file);
  });
}

const input = "h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-9";

/**
 * One step on a candidate's page: what it is, where it stands, and what the
 * office can do with it. The office can always do a step the paper way —
 * upload the copy, or say it's held in the office — whatever its online form.
 */
export function StepRow({ candidateId, step }: { candidateId: string; step: StepView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<null | "upload" | "paper" | "waive" | "sendback">(null);
  const [file, setFile] = useState<File | null>(null);
  const [expires, setExpires] = useState(step.doc?.expires_at ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pill = PILL[step.state];
  // What the candidate sent online goes back to waiting on an undo, never away.
  const fromCandidate = step.state === "confirmed" && !!step.doc?.uploaded_by_candidate;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That didn't work. Try again.");
      else {
        setMode(null);
        setText("");
        setFile(null);
        router.refresh();
      }
    });
  const view = async () => {
    if (!step.doc?.file_path) return;
    const { url } = await getDocUrlAction(step.doc.file_path);
    if (url) window.open(url, "_blank", "noopener");
  };

  const detail =
    step.state === "not_needed"
      ? `Not needed${step.doc?.not_required_reason ? `: ${step.doc.not_required_reason}` : ""}`
      : step.state === "sent_back"
        ? `Sent back: "${step.doc?.review_note ?? ""}"`
        : !step.doc?.file_name && step.doc?.uploaded_by_candidate && step.doc.review_note
          ? `Online: ${step.doc.review_note}`
          : !step.doc?.file_name && step.doc?.uploaded_by_candidate
          ? "Sent in online"
          : step.doc?.file_name
          ? `${step.doc.file_name}${step.doc.uploaded_by_candidate ? ", from the candidate" : ""}${
              step.doc.expires_at ? ` · ${step.state === "expired" ? "expired" : "expires"} ${formatDate(step.doc.expires_at)}` : ""
            }`
          : step.state === "confirmed"
            ? `Held on paper${step.doc?.review_note ? `: ${step.doc.review_note}` : ""}`
            : step.optionalNote
              ? `${step.hint} Optional: ${step.optionalNote}.`
              : step.hint;

  return (
    <li className="border-t px-5 py-3.5 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[1_1_16rem]">
          <p className="text-[15px] font-medium">
            {step.label}
            {!step.required && <span className="ml-2 text-xs font-normal text-muted-foreground">Optional</span>}
          </p>
          <p className={`mt-0.5 text-[13px] ${step.state === "expired" ? "text-destructive" : "text-muted-foreground"}`}>{detail}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pill.className}`}>{pill.label}</span>
        {!step.locked && (
          <div className="flex flex-wrap gap-2">
            {step.doc?.file_path && (
              <Button variant="outline" size="sm" onClick={view}>View</Button>
            )}
            {step.readHref && (
              <Link href={step.readHref} className={buttonVariants({ variant: "outline", size: "sm" })}>Read their application</Link>
            )}
            {step.state === "submitted" && step.signedHref && (
              <Link href={step.signedHref} className={buttonVariants({ size: "sm" })}>Read and sign</Link>
            )}
            {step.state === "submitted" && !step.signedHref && (
              <>
                <Button size="sm" disabled={pending} onClick={() => run(() => confirmStepAction(candidateId, step.key, ""))}>Confirm</Button>
                <Button variant="outline" size="sm" onClick={() => setMode("sendback")}>Send back</Button>
              </>
            )}
            {(step.state === "not_started" || step.state === "sent_back" || step.state === "expired") && (
              <>
                <Button variant="outline" size="sm" onClick={() => setMode("upload")}>Upload</Button>
                <Button variant="outline" size="sm" onClick={() => setMode("paper")}>Held on paper</Button>
                {!step.doc?.file_path && (
                  <Button variant="ghost" size="sm" onClick={() => setMode("waive")}>Not needed</Button>
                )}
              </>
            )}
            {(step.state === "confirmed" || step.state === "not_needed") && step.doc && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(fromCandidate ? "Undo confirming this? It goes back to waiting on you." : step.doc?.file_path ? "Remove this file? The step goes back to not started." : "Undo this? The step goes back to not started."))
                    run(() => deleteDocumentAction(step.doc!.id, candidateId));
                }}
              >
                {step.doc.file_path && !fromCandidate ? "Remove" : "Undo"}
              </Button>
            )}
          </div>
        )}
      </div>

      {mode === "upload" && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-muted/50 p-3">
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground">File (photo or PDF)</span>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" />
          </label>
          {step.tracksExpiry && (
            <label className="text-sm">
              <span className="block text-xs text-muted-foreground">Expires or recheck by</span>
              <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={input} />
            </label>
          )}
          <Button size="sm" disabled={pending || !file} onClick={() => file && run(async () => uploadDocumentAction(candidateId, step.key, await readFile(file), expires || null))}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      )}
      {(mode === "paper" || mode === "waive" || mode === "sendback") && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-muted/50 p-3">
          <label className="min-w-60 flex-1 text-sm">
            <span className="block text-xs text-muted-foreground">
              {mode === "paper" ? "Where it's kept (optional)" : mode === "waive" ? "Why it isn't needed" : "What needs changing (the candidate sees this)"}
            </span>
            <input value={text} onChange={(e) => setText(e.target.value)} className={input} maxLength={500} />
          </label>
          <Button
            size="sm"
            disabled={pending || (mode === "sendback" && !text.trim())}
            onClick={() =>
              run(() =>
                mode === "paper"
                  ? confirmStepAction(candidateId, step.key, text)
                  : mode === "waive"
                    ? markDocumentNotRequiredAction(candidateId, step.key, text)
                    : sendBackStepAction(candidateId, step.key, text),
              )
            }
          >
            {mode === "paper" ? "Mark done" : mode === "waive" ? "Not needed" : "Send back"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </li>
  );
}

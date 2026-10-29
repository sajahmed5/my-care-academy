"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { finishCandidateUploadAction, startCandidateUploadAction } from "./actions";

/** One document for the candidate to send: a photo or a PDF, straight from their phone. */
export function UploadStep({
  candidateId,
  step,
  label,
  hint,
  note,
}: {
  candidateId: string;
  step: string;
  label: string;
  hint: string;
  note: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const start = await startCandidateUploadAction(candidateId, step, { name: file.name, size: file.size, type: file.type });
      if (!start.ok) return setError(start.error);
      const { error: upErr } = await createClient().storage.from("candidate-docs").uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
      if (upErr) return setError("The upload didn't finish. Check your signal and try again.");
      const done = await finishCandidateUploadAction(candidateId, step, start.path, file.name);
      if (!done.ok) return setError(done.error ?? "Your file couldn't be saved. Try again.");
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={`rounded-2xl border bg-card p-4 ${note ? "border-amber-400" : ""}`}>
      <p className="font-semibold">{label}</p>
      {note ? (
        <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">From the office: &ldquo;{note}&rdquo;</p>
      ) : (
        <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      )}
      <label className={`mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground ${busy ? "opacity-60" : ""}`}>
        <Camera className="size-5" aria-hidden="true" />
        {busy ? "Uploading…" : "Take a photo or choose a file"}
        <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" disabled={busy} onChange={(e) => send(e.target.files?.[0])} />
      </label>
      <p className="mt-2 text-xs text-muted-foreground">A photo or PDF, up to 10MB.</p>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

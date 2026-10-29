"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { unlockLiteracyAction } from "../actions";

export interface AttemptView {
  attemptNo: number;
  mode: string;
  status: string;
  score: number | null;
  max: number | null;
  percent: number | null;
  passed: boolean | null;
  leftPage: number;
  endedByTime: boolean;
  passPercent: number;
  marked: { prompt: string; marks: number; awarded: number; given: string; correct: string }[];
}

/**
 * The literacy test from the office's side (brought across from MyRoster's
 * LiteracyPanel): show a QR code for the candidate to scan here, or email
 * them a link; then the result, how often they left the page, and their
 * answers marked.
 */
export function LiteracyPanel({ candidateId, hasEmail, attempt, minutes }: { candidateId: string; hasEmail: boolean; attempt: AttemptView | null; minutes: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qr, setQr] = useState<{ image: string; link: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const finished = attempt?.status === "submitted";

  const unlock = (mode: "office" | "remote") =>
    start(async () => {
      setMessage(null);
      const r = await unlockLiteracyAction(candidateId, mode, finished);
      if (!r.ok) return setMessage(r.error ?? "That didn't work.");
      if (r.link) setQr({ link: r.link, image: await QRCode.toDataURL(r.link, { margin: 1, width: 320 }) });
      else setMessage("Sent. They'll get an email with the link.");
      router.refresh();
    });

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium">Literacy test</span>
        <span className="text-muted-foreground">
          {!attempt
            ? "Not unlocked yet."
            : attempt.status === "in_progress"
              ? "They're taking it now."
              : attempt.status === "unlocked"
                ? `Unlocked ${attempt.mode === "office" ? "in the office" : "by email"}, not started.`
                : `${attempt.score}/${attempt.max} (${attempt.percent}%), ${attempt.passed ? "passed" : `below the ${attempt.passPercent}% pass mark`}${attempt.endedByTime ? ", ran out of time" : ""}${attempt.attemptNo > 1 ? `, attempt ${attempt.attemptNo}` : ""}.`}
        </span>
        {attempt?.status !== "in_progress" && (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => unlock("office")}>
              {finished ? "Retake here (QR code)" : "Take it here (QR code)"}
            </Button>
            <Button size="sm" variant="outline" disabled={pending || !hasEmail} onClick={() => unlock("remote")}>
              {finished ? "Retake at home (email)" : "Take it at home (email)"}
            </Button>
          </>
        )}
      </div>
      {finished && attempt && attempt.leftPage > 0 && (
        <p className="text-amber-900">They left the test page {attempt.leftPage} time{attempt.leftPage === 1 ? "" : "s"} while it was running.</p>
      )}
      {qr && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.image} alt="QR code for the literacy test" width={200} height={200} className="rounded-lg" />
          <div className="max-w-sm">
            <p className="font-medium">Ask them to scan this with their phone&apos;s camera.</p>
            <p className="mt-1 text-muted-foreground">They have 15 minutes to start, then {minutes} minutes once they press Begin. No help, and it should be on their own phone.</p>
            <p className="mt-2 break-all text-xs text-muted-foreground">If the code won&apos;t scan, they can type this in: <span className="select-all font-medium text-foreground">{qr.link}</span></p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setQr(null)}>Hide the code</Button>
          </div>
        </div>
      )}
      {finished && attempt && attempt.marked.length > 0 && (
        <details className="rounded-xl border bg-card">
          <summary className="cursor-pointer px-4 py-3 font-medium">Their answers, marked</summary>
          <ol className="divide-y border-t">
            {attempt.marked.map((m, i) => (
              <li key={i} className="px-4 py-2.5">
                <p className="font-medium">{i + 1}. {m.prompt}</p>
                <p className={m.awarded === m.marks ? "text-green-800" : "text-destructive"}>
                  {m.awarded}/{m.marks} · they gave: {m.given}
                  {m.awarded < m.marks && <span className="text-muted-foreground"> · answer: {m.correct}</span>}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

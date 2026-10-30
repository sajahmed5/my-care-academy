"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { deleteLiteracyAttemptAction, unlockLiteracyAction } from "../actions";

export interface AttemptView {
  id: string;
  attemptNo: number;
  mode: string;
  status: string;
  score: number | null;
  max: number | null;
  percent: number | null;
  passed: boolean | null;
  /** When it was finished, as a date. */
  when: string | null;
  leftPage: number;
  endedByTime: boolean;
  passPercent: number;
  marked: { prompt: string; marks: number; awarded: number; given: string; correct: string }[];
}

const resultLine = (a: AttemptView) =>
  `${a.score}/${a.max} (${a.percent}%), ${a.passed ? "passed" : `below the ${a.passPercent}% pass mark`}${a.endedByTime ? ", ran out of time" : ""}`;

const statusLine = (a: AttemptView) =>
  a.status === "in_progress"
    ? "They're taking it now."
    : a.status === "unlocked"
      ? `Unlocked ${a.mode === "office" ? "in the office" : "by email"}, not started.`
      : `${resultLine(a)}${a.attemptNo > 1 ? `, attempt ${a.attemptNo}` : ""}.`;

/**
 * The literacy test from the office's side (brought across from MyRoster's
 * LiteracyPanel): show a QR code for the candidate to scan here, or email
 * them a link; then the result, how often they left the page, and their
 * answers marked. Earlier attempts are listed under the latest, and any
 * attempt not being taken can be deleted (issue #80).
 */
export function LiteracyPanel({ candidateId, hasEmail, attempts, minutes }: { candidateId: string; hasEmail: boolean; attempts: AttemptView[]; minutes: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qr, setQr] = useState<{ image: string; link: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, ...earlier] = attempts;
  const finished = attempt?.status === "submitted";

  const unlock = (mode: "office" | "remote") => {
    // A finished test is never replaced without asking (issue #80).
    if (
      finished &&
      !window.confirm(
        `They've already taken the test: ${resultLine(attempt)}.\n\nA retake starts a new attempt ${mode === "office" ? "here" : "by email"}, and this result comes off the Literacy step until the new one is in. It stays listed below, and you can delete the retake to bring it back.\n\nStart a retake?`,
      )
    )
      return;
    start(async () => {
      setMessage(null);
      const r = await unlockLiteracyAction(candidateId, mode, finished);
      if (!r.ok) return setMessage(r.error ?? "That didn't work.");
      if (r.link) setQr({ link: r.link, image: await QRCode.toDataURL(r.link, { margin: 1, width: 320 }) });
      else setMessage("Sent. They'll get an email with the link.");
      router.refresh();
    });
  };

  const remove = (a: AttemptView) => {
    const latest = a.id === attempt?.id;
    const what = a.status === "submitted" ? `attempt ${a.attemptNo} (${resultLine(a)})` : `attempt ${a.attemptNo}, which hasn't been taken yet`;
    const after = !latest
      ? "The latest attempt stays as it is."
      : earlier.find((e) => e.status === "submitted")
        ? "The Literacy step goes back to the earlier result."
        : "The Literacy step goes back to not started.";
    if (!window.confirm(`Delete ${what}? ${after} This can't be undone.`)) return;
    start(async () => {
      setMessage(null);
      const r = await deleteLiteracyAttemptAction(candidateId, a.id);
      if (!r.ok) return setMessage(r.error ?? "That didn't work.");
      if (latest) setQr(null);
      setMessage("Deleted.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium">Literacy test</span>
        <span className="text-muted-foreground">{attempt ? statusLine(attempt) : "Not unlocked yet."}</span>
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
        {attempt && attempt.status !== "in_progress" && (
          <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => remove(attempt)}>
            Delete
          </Button>
        )}
      </div>
      {finished && attempt.leftPage > 0 && (
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
      {finished && <MarkedAnswers attempt={attempt} />}
      {earlier.length > 0 && (
        <div className="rounded-xl border bg-card">
          <p className="border-b px-4 py-2.5 font-medium">Earlier attempts</p>
          <ul className="divide-y">
            {earlier.map((a) => (
              <li key={a.id} className="space-y-2 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium">Attempt {a.attemptNo}</span>
                  <span className="text-muted-foreground">
                    {a.status === "submitted"
                      ? `${resultLine(a)} · ${a.mode === "remote" ? "taken at home" : "taken in the office"}${a.when ? ` · ${a.when}` : ""}`
                      : "Not taken."}
                  </span>
                  <Button size="sm" variant="ghost" className="ml-auto text-destructive" disabled={pending} onClick={() => remove(a)}>
                    Delete
                  </Button>
                </div>
                {a.status === "submitted" && <MarkedAnswers attempt={a} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

function MarkedAnswers({ attempt }: { attempt: AttemptView }) {
  if (attempt.marked.length === 0) return null;
  return (
    <details className="rounded-xl border bg-card">
      <summary className="cursor-pointer px-4 py-3 font-medium">Their answers, marked{attempt.attemptNo > 1 ? ` (attempt ${attempt.attemptNo})` : ""}</summary>
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
  );
}

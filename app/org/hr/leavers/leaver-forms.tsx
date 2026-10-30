"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, textareaClass } from "@/components/hr/fields";
import { LEAVING_REASONS, RE_EMPLOYABLE } from "@/lib/hr/leavers";
import {
  askExitInterviewAction,
  cancelLeaverAction,
  checklistAction,
  deleteReferenceDraftAction,
  draftReferenceWithAiAction,
  emailTrainingRecordAction,
  exitDeclinedAction,
  leaverDbsAction,
  newReferenceRequestAction,
  recordLeaverAction,
  saveReferenceAction,
  sendReferenceAction,
  switchOffNowAction,
  updateLeaverAction,
  type LeaverInput,
} from "./actions";

type R = { ok: boolean; error?: string; id?: string };
const lab = "text-xs font-medium";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<R>, ok = "Saved.", after?: (r: R) => void) =>
    start(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage(r.error ?? "That didn't save.");
      setMessage(ok);
      after?.(r);
      router.refresh();
    });
  const note = message ? <span role="status" className="text-sm text-muted-foreground">{message}</span> : null;
  return { run, pending, note, router };
}

/** Record that someone is leaving, or change the record. */
export function LeaverForm({ people, userId, leaverId, initial }: { people?: Array<{ id: string; name: string }>; userId?: string; leaverId?: string; initial?: LeaverInput }) {
  const { run, pending, note, router } = useRun();
  const [who, setWho] = useState(userId ?? "");
  const [f, setF] = useState<LeaverInput>(initial ?? { reason: "resigned", reasonDetail: "", noticeOn: new Date().toISOString().slice(0, 10), lastDay: "", reEmployable: "yes", reEmployableNote: "" });
  const set = (p: Partial<LeaverInput>) => setF((x) => ({ ...x, ...p }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {people && (
          <div className="space-y-1">
            <label htmlFor="lv-who" className={lab}>Who</label>
            <select id="lv-who" className={`${selectClass} w-56`} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Choose…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="lv-reason" className={lab}>Why they&apos;re leaving</label>
          <select id="lv-reason" className={`${selectClass} w-60`} value={f.reason} onChange={(e) => set({ reason: e.target.value })}>
            {LEAVING_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="lv-notice" className={lab}>Notice given on</label>
          <Input id="lv-notice" type="date" value={f.noticeOn} onChange={(e) => set({ noticeOn: e.target.value })} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="lv-last" className={lab}>Last working day</label>
          <Input id="lv-last" type="date" value={f.lastDay} onChange={(e) => set({ lastDay: e.target.value })} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="lv-re" className={lab}>Could they be re-employed?</label>
          <select id="lv-re" className={`${selectClass} w-48`} value={f.reEmployable} onChange={(e) => set({ reEmployable: e.target.value })}>
            {RE_EMPLOYABLE.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>
      {f.reEmployable !== "yes" && (
        <Input value={f.reEmployableNote} onChange={(e) => set({ reEmployableNote: e.target.value })} placeholder="Why, or on what conditions (only the office sees this)" maxLength={1000} aria-label="Re-employment note" />
      )}
      <textarea rows={2} className={textareaClass} value={f.reasonDetail} onChange={(e) => set({ reasonDetail: e.target.value })} placeholder="Details (optional)" aria-label="Details" />
      <p className="text-xs text-muted-foreground">Their login is switched off automatically the day after their last working day, and their training record is emailed to them.</p>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => (leaverId ? updateLeaverAction(leaverId, f) : recordLeaverAction(who, f)),
              "Saved.",
              (r) => {
                if (!leaverId && r.id) router.push(`/org/hr/leavers/${r.id}`);
              },
            )
          }
        >
          {leaverId ? "Save changes" : "Record that they're leaving"}
        </Button>
        {note}
      </div>
    </div>
  );
}

export function ChecklistRow({ leaverId, itemKey, label, hint, done, on, note: initialNote }: { leaverId: string; itemKey: string; label: string; hint?: string; done: boolean; on: string | null; note: string | null }) {
  const { run, pending, note } = useRun();
  const [n, setN] = useState(initialNote ?? "");
  return (
    <div className="space-y-1 py-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={done} disabled={pending} onChange={(e) => run(() => checklistAction(leaverId, itemKey, { done: e.target.checked, on: "", note: n }))} />
        <span className={done ? "line-through text-muted-foreground" : "font-medium"}>{label}</span>
        {done && on && <span className="text-xs text-muted-foreground">done {on}</span>}
      </label>
      {hint && <p className="pl-6 text-xs text-muted-foreground">{hint}</p>}
      {itemKey === "key_safes" && (
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <Input value={n} onChange={(e) => setN(e.target.value)} placeholder="Whose homes, for example: Mrs Smith, Mr Patel" className="h-8 w-96" aria-label="Which homes" />
          <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => checklistAction(leaverId, itemKey, { done, on: "", note: n }))}>Save</Button>
        </div>
      )}
      {note}
    </div>
  );
}

export function LeaverButtons({ leaverId, exitStatus, loginOff, trainingSent }: { leaverId: string; exitStatus: string; loginOff: boolean; trainingSent: boolean }) {
  const { run, pending, note, router } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {exitStatus !== "done" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => askExitInterviewAction(leaverId), "Sent.")}>
          {exitStatus === "asked" ? "Send the exit interview again" : "Ask for an exit interview"}
        </Button>
      )}
      {exitStatus === "asked" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => exitDeclinedAction(leaverId))}>They&apos;d rather not</Button>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => emailTrainingRecordAction(leaverId), "Emailed.")}>
        {trainingSent ? "Email their training record again" : "Email their training record now"}
      </Button>
      {!loginOff && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Switch their login off now, before their last day?")) return;
            run(() => switchOffNowAction(leaverId));
          }}
        >
          Switch their login off now
        </Button>
      )}
      {!loginOff && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("They're staying? This removes the leaving record.")) return;
            run(() => cancelLeaverAction(leaverId), "Removed.", () => router.push("/org/hr/leavers"));
          }}
        >
          They&apos;re staying
        </Button>
      )}
      {note}
    </div>
  );
}

export function LeaverDbs({ leaverId, status, on }: { leaverId: string; status: string; on: string | null }) {
  const { run, pending, note } = useRun();
  const [d, setD] = useState("");
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="font-medium">DBS barring referral</span>
        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${status === "done" ? "bg-green-100 text-green-700" : status === "needed" ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground"}`}>
          {status === "done" ? `Made ${on ?? ""}` : status === "needed" ? "Needed" : status === "not_needed" ? "Not needed" : "Not decided"}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        A legal duty when someone is dismissed, or would have been had they not left, for harming a vulnerable person or putting one at risk. The site reminds you; you make the referral to the DBS and confirm it here.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {status === "unknown" && (
          <>
            <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => leaverDbsAction(leaverId, "needed", ""))}>Needed</Button>
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => leaverDbsAction(leaverId, "not_needed", ""))}>Not needed</Button>
          </>
        )}
        {status === "needed" && (
          <>
            <Input type="date" value={d} onChange={(e) => setD(e.target.value)} className="h-8 w-40" aria-label="Date made" />
            <Button size="xs" disabled={pending} onClick={() => run(() => leaverDbsAction(leaverId, "done", d))}>Confirm it&apos;s made</Button>
          </>
        )}
        {status !== "unknown" && (
          <button className="text-xs text-muted-foreground underline" onClick={() => run(() => leaverDbsAction(leaverId, "unknown", ""))}>Undo</button>
        )}
        {note}
      </div>
    </div>
  );
}

export function ReferenceRequestForm({ userId }: { userId: string }) {
  const { run, pending, note } = useRun();
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Who asked" className="w-48" aria-label="Who asked" />
        <Input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Their organisation" className="w-56" aria-label="Their organisation" />
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" className="w-60" aria-label="Their email" />
        <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="w-40" aria-label="Received on" />
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => newReferenceRequestAction(userId, { requesterName: name, requesterOrg: org, requesterEmail: email, receivedOn: on }), "Drafted below.")}>
          Record the request and draft the reference
        </Button>
        {note}
      </div>
    </div>
  );
}

/** The reference: factual by default, AI can redraft it from the manager's notes, a manager sends it. */
export function ReferenceEditor({ id, body: initial, to, canSend, ai }: { id: string; body: string; to: string | null; canSend: boolean; ai: string | null }) {
  const { run, pending, note, router } = useRun();
  const [body, setBody] = useState(initial);
  const [notes, setNotes] = useState("");
  const [busy, startAi] = useTransition();
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <textarea rows={8} className={textareaClass} value={body} onChange={(e) => setBody(e.target.value)} aria-label="The reference" />
      <details className="rounded-lg border p-3 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium"><Sparkles className="size-4" aria-hidden /> Draft it with AI</summary>
        {ai ? (
          <p className="mt-2 text-muted-foreground">{ai}</p>
        ) : (
          <div className="mt-2 space-y-2">
            <textarea rows={2} className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to add beyond the facts on file: only what's true and fair" aria-label="Notes for AI" />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                startAi(async () => {
                  const r = await draftReferenceWithAiAction(id, notes);
                  if (!r.ok) return setAiMsg(r.error ?? "That didn't work.");
                  setBody(r.body ?? body);
                  setAiMsg("Drafted. A manager checks it before it goes.");
                })
              }
            >
              Redraft
            </Button>
            {aiMsg && <p className="text-xs text-muted-foreground">{aiMsg}</p>}
          </div>
        )}
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => saveReferenceAction(id, body))}>Save</Button>
        {canSend ? (
          <Button
            size="sm"
            disabled={pending || !to}
            onClick={() => {
              if (!window.confirm(`Email this reference to ${to}? A PDF copy is kept.`)) return;
              run(() => sendReferenceAction(id, body), "Sent.");
            }}
          >
            Send to {to ?? "them"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">A manager checks and sends it.</span>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteReferenceDraftAction(id), "Removed.", () => router.refresh())}>Discard</Button>
        {note}
      </div>
    </div>
  );
}

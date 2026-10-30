"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass, textareaClass } from "@/components/hr/fields";
import { SignaturePad } from "@/app/org/forms/[id]/fill/signature-pad";
import { APPEAL_OUTCOMES, DISCIPLINARY_OUTCOMES, GRIEVANCE_OUTCOMES, RECOMMENDATIONS } from "@/lib/hr/cases";
import {
  acknowledgeGrievanceAction,
  addMeetingAction,
  addNoteAction,
  addTypedStatementAction,
  appealAction,
  appealOutcomeAction,
  closeCaseAction,
  evidenceUrlAction,
  inviteAction,
  legalAction,
  outcomeAction,
  reopenCaseAction,
  reviewSuspensionAction,
  saveReportAction,
  sendStatementLinkAction,
  setInvestigatorAction,
  setWarningExpiryAction,
  signMinutesAction,
  suspendAction,
  uploadEvidenceAction,
} from "../actions";

type R = { ok: boolean; error?: string; letterId?: string };
const lab = "text-xs font-medium";

/** Run an action; on success refresh, or open the letter it drafted. */
function useRun(caseId: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<R>, ok = "Saved.") =>
    start(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage(r.error ?? "That didn't save.");
      if (r.letterId) return router.push(`/org/hr/letters/${r.letterId}?back=${encodeURIComponent(`/org/hr/cases/${caseId}`)}`);
      setMessage(ok);
      router.refresh();
    });
  const note = message ? <span role="status" className="text-sm text-muted-foreground">{message}</span> : null;
  return { run, pending, note };
}

const field = (id: string, label: string, el: React.ReactNode) => (
  <div className="space-y-1">
    <label htmlFor={id} className={lab}>{label}</label>
    {el}
  </div>
);

export function SuspendForm({ caseId }: { caseId: string }) {
  const { run, pending, note } = useRun(caseId);
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [review, setReview] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {field("su-on", "From", <Input id="su-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className="w-40" />)}
        {field("su-review", "Review by", <Input id="su-review" type="date" value={review} onChange={(e) => setReview(e.target.value)} className="w-40" />)}
      </div>
      {field("su-reason", "Why (it goes in their letter)", <textarea id="su-reason" rows={3} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />)}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => suspendAction(caseId, { on, reason, reviewOn: review }))}>
          Suspend on full pay and write the letter
        </Button>
        {note}
      </div>
    </div>
  );
}

export function SuspensionReview({ caseId }: { caseId: string }) {
  const { run, pending, note } = useRun(caseId);
  const [next, setNext] = useState("");
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="flex flex-wrap items-end gap-3">
      {field("sr-next", "Next review", <Input id="sr-next" type="date" value={next} onChange={(e) => setNext(e.target.value)} className="w-40" />)}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reviewSuspensionAction(caseId, { endOn: "", nextReviewOn: next }))}>
        It continues
      </Button>
      {field("sr-end", "Or it ends on", <Input id="sr-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" />)}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reviewSuspensionAction(caseId, { endOn: end, nextReviewOn: "" }))}>
        End the suspension
      </Button>
      {note}
    </div>
  );
}

export function InvestigatorPicker({ caseId, staff, current }: { caseId: string; staff: Array<{ id: string; name: string }>; current: string | null }) {
  const { run, pending, note } = useRun(caseId);
  const [who, setWho] = useState(current ?? "");
  return (
    <div className="flex flex-wrap items-end gap-3">
      {field(
        "inv-who",
        "Investigator",
        <select id="inv-who" className={`${selectClass} w-60`} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Choose…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>,
      )}
      <Button size="sm" variant="outline" disabled={pending || !who} onClick={() => run(() => setInvestigatorAction(caseId, who))}>
        Save
      </Button>
      {note}
    </div>
  );
}

export function ReportForm({ caseId, disciplinary, report, recommendation }: { caseId: string; disciplinary: boolean; report: string; recommendation: string }) {
  const { run, pending, note } = useRun(caseId);
  const [text, setText] = useState(report);
  const [rec, setRec] = useState(recommendation);
  return (
    <div className="space-y-2">
      {field("rp-text", "The report: what was found, and why", <textarea id="rp-text" rows={6} className={textareaClass} value={text} onChange={(e) => setText(e.target.value)} />)}
      {disciplinary &&
        field(
          "rp-rec",
          "Recommendation",
          <select id="rp-rec" className={`${selectClass} w-60`} value={rec} onChange={(e) => setRec(e.target.value)}>
            <option value="">Choose…</option>
            {RECOMMENDATIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>,
        )}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => saveReportAction(caseId, { report: text, recommendation: rec }))}>
          Save the report
        </Button>
        {note}
      </div>
    </div>
  );
}

function readFile(file: File): Promise<{ name: string; dataUrl: string }> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, dataUrl: String(r.result) });
    r.readAsDataURL(file);
  });
}

export function EvidenceUpload({ caseId }: { caseId: string }) {
  const { run, pending, note } = useRun(caseId);
  const [file, setFile] = useState<File | null>(null);
  const [what, setWhat] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-8 w-56 text-xs" aria-label="Evidence file" />
      <Input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What it is" className="h-8 w-64" maxLength={1000} />
      <Button size="xs" disabled={pending || !file} onClick={async () => file && run(async () => uploadEvidenceAction(caseId, await readFile(file), what), "Uploaded.")}>
        Upload
      </Button>
      {note}
    </div>
  );
}

export function EvidenceLink({ noteId, name }: { noteId: string; name: string }) {
  return (
    <button
      className="font-medium text-primary hover:underline"
      onClick={async () => {
        const { url } = await evidenceUrlAction(noteId);
        if (url) window.open(url, "_blank");
      }}
    >
      {name}
    </button>
  );
}

/** A witness statement: typed and signed here, or the witness writes it from a link. */
export function StatementForm({ caseId }: { caseId: string }) {
  const { run, pending, note } = useRun(caseId);
  const [method, setMethod] = useState<"typed" | "link">("typed");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [statement, setStatement] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={method === "typed"} onChange={() => setMethod("typed")} /> Type it with them, and they sign here
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={method === "link"} onChange={() => setMethod("link")} /> Send them a link to write it themselves
        </label>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Witness's name" maxLength={120} aria-label="Witness's name" />
      {method === "link" ? (
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" aria-label="Their email" />
      ) : (
        <>
          <textarea rows={6} className={textareaClass} value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Their account, in their words" aria-label="Statement" />
          <p className="text-xs text-muted-foreground">The witness reads it, then signs and types their name.</p>
          <SignaturePad onChange={setSignature} />
          <Input value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder="Their name, typed by them" maxLength={120} aria-label="Signed name" />
        </>
      )}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                method === "link"
                  ? sendStatementLinkAction(caseId, { name, email })
                  : addTypedStatementAction(caseId, { name, statement, signature: signature ?? "", signedName }),
              method === "link" ? "Sent." : "Saved.",
            )
          }
        >
          {method === "link" ? "Send the link" : "Save the signed statement"}
        </Button>
        {note}
      </div>
    </div>
  );
}

export function InviteForm({ caseId, grievance, noticeDays }: { caseId: string; grievance: boolean; noticeDays: number }) {
  const { run, pending, note } = useRun(caseId);
  const [on, setOn] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [details, setDetails] = useState("");
  const [possible, setPossible] = useState("a first written warning");
  const [shorter, setShorter] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {field("iv-on", "Date", <Input id="iv-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className="w-40" />)}
        {field("iv-time", "Time", <Input id="iv-time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" placeholder="10:00" />)}
        {field("iv-place", "Where", <Input id="iv-place" value={place} onChange={(e) => setPlace(e.target.value)} className="w-64" placeholder="The office" />)}
        {!grievance &&
          field(
            "iv-possible",
            "Possible outcome",
            <select id="iv-possible" className={`${selectClass} w-56`} value={possible} onChange={(e) => setPossible(e.target.value)}>
              <option>a first written warning</option>
              <option>a final written warning</option>
              <option>dismissal</option>
            </select>,
          )}
      </div>
      {field(
        "iv-details",
        grievance ? "What the meeting is about" : "The allegations, set out clearly",
        <textarea id="iv-details" rows={5} className={textareaClass} value={details} onChange={(e) => setDetails(e.target.value)} />,
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={shorter} onChange={(e) => setShorter(e.target.checked)} /> They agreed to less than {noticeDays} days&apos; notice
      </label>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={pending} onClick={() => run(() => inviteAction(caseId, { on, time, place, details, possibleOutcome: possible, shorterAgreed: shorter }))}>
          Set the {grievance ? "meeting" : "hearing"} and write the invitation
        </Button>
        {note}
      </div>
    </div>
  );
}

export function AcknowledgeButton({ caseId }: { caseId: string }) {
  const { run, pending, note } = useRun(caseId);
  return (
    <div className="flex items-center gap-3">
      <Button size="sm" disabled={pending} onClick={() => run(() => acknowledgeGrievanceAction(caseId))}>
        Write the acknowledgement
      </Button>
      {note}
    </div>
  );
}

export function MeetingForm({ caseId, kinds }: { caseId: string; kinds: Array<{ value: string; label: string }> }) {
  const { run, pending, note } = useRun(caseId);
  const [kind, setKind] = useState(kinds[0]?.value ?? "meeting");
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [attendees, setAttendees] = useState("");
  const [accompanied, setAccompanied] = useState("");
  const [minutes, setMinutes] = useState("");
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap gap-3">
        {field(
          "mt-kind",
          "Which",
          <select id="mt-kind" className={`${selectClass} w-52`} value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>,
        )}
        {field("mt-on", "Held on", <Input id="mt-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className="w-40" />)}
        {field("mt-who", "Who was there", <Input id="mt-who" value={attendees} onChange={(e) => setAttendees(e.target.value)} className="w-64" />)}
        {field("mt-acc", "Accompanied by", <Input id="mt-acc" value={accompanied} onChange={(e) => setAccompanied(e.target.value)} className="w-52" placeholder="Nobody" />)}
      </div>
      {field("mt-minutes", "Minutes, typed as it happens", <textarea id="mt-minutes" rows={8} className={textareaClass} value={minutes} onChange={(e) => setMinutes(e.target.value)} />)}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => addMeetingAction(caseId, { kind, heldOn: on, attendees, accompaniedBy: accompanied, minutes }))}>
          Save the minutes
        </Button>
        {note}
      </div>
    </div>
  );
}

/** The employee signs the minutes as accurate on this screen, or the manager records their refusal. */
export function SignMinutes({ caseId, meetingId, name }: { caseId: string; meetingId: string; name: string }) {
  const { run, pending, note } = useRun(caseId);
  const [refused, setRefused] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  const [why, setWhy] = useState("");
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">{name} signs the minutes as accurate</p>
      {refused ? (
        <textarea rows={2} className={textareaClass} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="What they said when they refused" aria-label="Why they refused" />
      ) : (
        <>
          <SignaturePad onChange={setSignature} />
          <Input value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder="Their name, typed by them" aria-label="Signed name" />
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => signMinutesAction(meetingId, { signature: signature ?? "", signedName, refused, refusedNote: why }))}>
          {refused ? "Record that they refused" : "Save their signature"}
        </Button>
        <button className="text-xs text-muted-foreground underline" onClick={() => setRefused(!refused)}>
          {refused ? "They'll sign after all" : "They refused to sign"}
        </button>
        {note}
      </div>
    </div>
  );
}

export function OutcomeForm({ caseId, grievance, firstMonths, finalMonths }: { caseId: string; grievance: boolean; firstMonths: number; finalMonths: number }) {
  const { run, pending, note } = useRun(caseId);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [months, setMonths] = useState("");
  const options = grievance ? GRIEVANCE_OUTCOMES : DISCIPLINARY_OUTCOMES;
  const warning = outcome === "first_written" || outcome === "final_written";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${outcome === o.value ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" name="case-outcome" checked={outcome === o.value} onChange={() => setOutcome(o.value)} /> {o.label}
          </label>
        ))}
      </div>
      {warning && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          Active for
          <Input type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} placeholder={String(outcome === "first_written" ? firstMonths : finalMonths)} className="w-20" aria-label="Months" />
          months
        </div>
      )}
      {field("oc-notes", grievance ? "The findings, and any actions" : "The reasons", <textarea id="oc-notes" rows={5} className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />)}
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={pending} onClick={() => run(() => outcomeAction(caseId, { outcome, notes, warningMonths: months ? Number(months) : null }))}>
          Record the outcome and write the letter
        </Button>
        {note}
      </div>
    </div>
  );
}

export function WarningExpiry({ caseId, on }: { caseId: string; on: string }) {
  const { run, pending, note } = useRun(caseId);
  const [d, setD] = useState(on);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      Active until
      <Input type="date" value={d} onChange={(e) => setD(e.target.value)} className="h-8 w-40" aria-label="Active until" />
      <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => setWarningExpiryAction(caseId, d))}>
        Change
      </Button>
      {note}
    </div>
  );
}

export function AppealForm({ caseId, managers, disciplinary }: { caseId: string; managers: Array<{ id: string; name: string }>; disciplinary: boolean }) {
  const { run, pending, note } = useRun(caseId);
  const [received, setReceived] = useState(new Date().toISOString().slice(0, 10));
  const [grounds, setGrounds] = useState("");
  const [manager, setManager] = useState("");
  const [on, setOn] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {field("ap-received", "Appeal received", <Input id="ap-received" type="date" value={received} onChange={(e) => setReceived(e.target.value)} className="w-40" />)}
        {field(
          "ap-manager",
          "Heard by (a different manager)",
          <select id="ap-manager" className={`${selectClass} w-56`} value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="">Choose…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>,
        )}
        {field("ap-on", "Appeal hearing", <Input id="ap-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className="w-40" />)}
        {disciplinary && field("ap-time", "Time", <Input id="ap-time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />)}
        {disciplinary && field("ap-place", "Where", <Input id="ap-place" value={place} onChange={(e) => setPlace(e.target.value)} className="w-52" />)}
      </div>
      {field("ap-grounds", "Their grounds of appeal", <textarea id="ap-grounds" rows={4} className={textareaClass} value={grounds} onChange={(e) => setGrounds(e.target.value)} />)}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => appealAction(caseId, { receivedOn: received, grounds, managerId: manager, hearingOn: on, time, place }))}>
          Record the appeal
        </Button>
        {note}
      </div>
    </div>
  );
}

export function AppealOutcomeForm({ caseId }: { caseId: string }) {
  const { run, pending, note } = useRun(caseId);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {APPEAL_OUTCOMES.map((o) => (
          <label key={o.value} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${outcome === o.value ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" name="appeal-outcome" checked={outcome === o.value} onChange={() => setOutcome(o.value)} /> {o.label}
          </label>
        ))}
      </div>
      {field("ao-notes", "The reasons", <textarea id="ao-notes" rows={4} className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />)}
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={pending} onClick={() => run(() => appealOutcomeAction(caseId, { outcome, notes }))}>
          Record the decision and write the final letter
        </Button>
        {note}
      </div>
    </div>
  );
}

const LEGAL: Array<{ key: "dbs_referral" | "cqc_notice" | "la_notice"; label: string; hint: string }> = [
  {
    key: "dbs_referral",
    label: "DBS barring referral",
    hint: "A legal duty when someone is dismissed (or would have been, had they not left) for harming a vulnerable person or putting one at risk.",
  },
  { key: "cqc_notice", label: "Tell CQC", hint: "Where the matter is one CQC must be notified of." },
  { key: "la_notice", label: "Tell the local authority safeguarding team", hint: "Where there is a safeguarding concern." },
];

/** The site reminds; the manager confirms. Nothing is filed from here. */
export function LegalDuties({ caseId, state }: { caseId: string; state: Record<string, { status: string; on: string | null }> }) {
  const { run, pending, note } = useRun(caseId);
  const [dates, setDates] = useState<Record<string, string>>({});
  return (
    <div className="space-y-3">
      {LEGAL.map((l) => {
        const s = state[l.key];
        return (
          <div key={l.key} className="space-y-1 text-sm">
            <p className="font-medium">
              {l.label}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${s.status === "done" ? "bg-green-100 text-green-700" : s.status === "needed" ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground"}`}>
                {s.status === "done" ? `Done ${s.on ?? ""}` : s.status === "needed" ? "Needed" : s.status === "not_needed" ? "Not needed" : "Not decided"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{l.hint}</p>
            <div className="flex flex-wrap items-center gap-2">
              {s.status !== "needed" && s.status !== "done" && (
                <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => legalAction(caseId, l.key, "needed", ""))}>Needed</Button>
              )}
              {s.status === "unknown" && (
                <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => legalAction(caseId, l.key, "not_needed", ""))}>Not needed</Button>
              )}
              {s.status === "needed" && (
                <>
                  <Input type="date" value={dates[l.key] ?? ""} onChange={(e) => setDates({ ...dates, [l.key]: e.target.value })} className="h-8 w-40" aria-label={`${l.label}: date done`} />
                  <Button size="xs" disabled={pending} onClick={() => run(() => legalAction(caseId, l.key, "done", dates[l.key] ?? ""))}>Confirm it&apos;s done</Button>
                </>
              )}
              {s.status !== "unknown" && (
                <button className="text-xs text-muted-foreground underline" onClick={() => run(() => legalAction(caseId, l.key, "unknown", ""))}>Undo</button>
              )}
            </div>
          </div>
        );
      })}
      {note}
    </div>
  );
}

export function NoteForm({ caseId }: { caseId: string }) {
  const { run, pending, note } = useRun(caseId);
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <textarea rows={2} className={textareaClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="A note for the file" aria-label="Note" />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => { const r = await addNoteAction(caseId, text); if (r.ok) setText(""); return r; })}>
          Add the note
        </Button>
        {note}
      </div>
    </div>
  );
}

export function CloseCase({ caseId, closed }: { caseId: string; closed: boolean }) {
  const { run, pending, note } = useRun(caseId);
  return (
    <div className="flex items-center gap-3">
      {closed ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reopenCaseAction(caseId))}>Reopen the case</Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Close this case? It stays on record.")) return;
            run(() => closeCaseAction(caseId, ""));
          }}
        >
          Close the case
        </Button>
      )}
      {note}
    </div>
  );
}

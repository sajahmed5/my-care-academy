"use client";

import { startTransition, useActionState, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Complaint, ComplaintAction, StageEntry, StaffOption } from "@/lib/complaints/data";
import type { ComplaintStage } from "@/lib/complaints/stages";
import { formForStage } from "@/lib/complaints/forms";
import type { AnswerMap } from "@/lib/complaints/schema";
import { LETTER_KINDS, actionTagFor, holdsFindings, isTriageStage } from "@/lib/complaints/compute";
import { acknowledgementLetter, acknowledgementState } from "@/lib/complaints/acknowledgement";
import {
  FINDINGS_ACTIONS,
  TRIAGE_CHECKS,
  readFindingsNa,
  readTriageNa,
  triageChecksUnassigned,
} from "@/lib/complaints/stage-status";
import {
  FINDING_OPTIONS,
  findingsOutstanding,
  readConcernFindings,
  type ConcernFinding,
} from "@/lib/complaints/findings";
import {
  addActionAction,
  deleteActionAction,
  deleteDocumentAction,
  markNotNeededAction,
  saveFindingsAction,
  saveLetterAction,
  setActionDoneAction,
  setStageStatusAction,
  uploadDocumentAction,
} from "../actions";
import { selectClass, textareaClass } from "../new-complaint";
import { fmtDate } from "../complaint-row";
import { StageForm } from "./stage-form";
import type { SaveState } from "@/app/platform/actions";
import { formatDate, formatDateTime } from "@/lib/dates";

interface PanelProps {
  complaint: Complaint;
  stage: ComplaintStage;
  entry: StageEntry | undefined;
  staff: StaffOption[];
  organisationName: string;
  senderName: string | null;
  today: string;
  disabled: boolean;
}

/** What a stage opens, by its kind. */
export function StagePanel(props: PanelProps) {
  const { stage, entry } = props;
  const answers = (entry?.formAnswers ?? {}) as AnswerMap;
  const form = formForStage(stage);

  if (LETTER_KINDS.has(stage.kind)) return <LetterPanel {...props} />;

  if (form) {
    const tag = actionTagFor(stage);
    return (
      <div className="space-y-5">
        <StatusLine entry={entry} />
        <StageForm
          complaintId={props.complaint.id}
          stageId={stage.id}
          schema={form}
          initial={answers}
          staff={props.staff}
          disabled={props.disabled}
        />
        {holdsFindings(stage) && <FindingsEditor {...props} />}
        {(stage.kind === "meeting_minutes" || stage.kind === "action_plan") && (
          <ActionsEditor {...props} tag={tag} />
        )}
        <DocumentsBox {...props} />
        <NotNeeded {...props} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DocumentStatus {...props} />
      <DocumentsBox {...props} />
    </div>
  );
}

function StatusLine({ entry }: { entry: StageEntry | undefined }) {
  const st = entry?.status ?? "pending";
  return (
    <p className="text-xs text-muted-foreground">
      {st === "done" ? "Done" : st === "na" ? `Not needed${entry?.notes ? ` — ${entry.notes}` : ""}` : "Not finished"}
      {entry ? ` · last saved ${formatDateTime(entry.updatedAt)}` : ""}
    </p>
  );
}

/** Done, not needed, or pending, by hand — the only control a document stage has. */
function DocumentStatus({ complaint, stage, entry, disabled }: PanelProps) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setStageStatusAction, {});
  const [status, setStatus] = useState(entry?.status ?? "pending");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  return (
    <form
      // Not <form action>: the reset React does after a save would put the
      // status back to the option the page loaded with (#69). See StageForm.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-2"
    >
      <input type="hidden" name="complaintId" value={complaint.id} />
      <input type="hidden" name="stageId" value={stage.id} />
      <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1">
          <Label htmlFor={`st-${stage.id}`}>Status</Label>
          <select id={`st-${stage.id}`} name="status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)} disabled={disabled}>
            <option value="pending">Not yet</option>
            <option value="done">Done</option>
            <option value="na">Not needed</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`nt-${stage.id}`}>Note (why, if not needed)</Label>
          <Input id={`nt-${stage.id}`} name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={disabled} />
        </div>
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {!disabled && <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>}
    </form>
  );
}

/** Mark a form stage not needed, with why — or clear that. */
function NotNeeded({ complaint, stage, entry, disabled }: PanelProps) {
  const [state, action, pending] = useActionState<SaveState, FormData>(setStageStatusAction, {});
  if (disabled) return null;
  const na = entry?.status === "na";
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 border-t pt-3">
      <input type="hidden" name="complaintId" value={complaint.id} />
      <input type="hidden" name="stageId" value={stage.id} />
      <input type="hidden" name="status" value={na ? "pending" : "na"} />
      {!na && (
        <div className="flex-1 space-y-1">
          <Label htmlFor={`na-${stage.id}`}>This stage is not needed on this record because</Label>
          <Input id={`na-${stage.id}`} name="notes" placeholder="Why" />
        </div>
      )}
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {na ? "It is needed after all" : "Mark not needed"}
      </Button>
      {state.error && <p className="w-full text-sm text-rose-600">{state.error}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Letters: acknowledgement, outcome, duty of candour
// ---------------------------------------------------------------------------

function LetterPanel({ complaint, stage, entry, organisationName, senderName, today, disabled }: PanelProps) {
  const a = (entry?.formAnswers ?? {}) as Record<string, unknown>;
  const draft =
    stage.kind === "acknowledgement"
      ? acknowledgementLetter({
          kind: complaint.kind,
          reference: complaint.reference,
          raisedByName: complaint.raisedByName,
          aboutName: complaint.aboutName,
          reportedOn: complaint.reportedOn,
          completeBy: complaint.completeBy,
          senderName,
          organisationName,
        })
      : { subject: "", body: "" };
  // Controlled throughout: after a save the entry's values change under a
  // mounted panel, and an uncontrolled input whose default moves is a Base UI
  // warning and a field that silently keeps the old text.
  const [subject, setSubject] = useState(String(a.subject ?? draft.subject));
  const [body, setBody] = useState(String(a.body ?? draft.body));
  const [sentTo, setSentTo] = useState(String(a.sentTo ?? complaint.raisedByName ?? ""));
  const [sentOn, setSentOn] = useState(typeof a.sentOn === "string" ? a.sentOn : "");
  const [state, action, pending] = useActionState<SaveState, FormData>(saveLetterAction, {});
  const ack = stage.kind === "acknowledgement" ? acknowledgementState(complaint.reportedOn, a, today) : null;

  return (
    <div className="space-y-4">
      {ack && (
        <p className={`text-sm ${ack.overdue ? "text-rose-700" : "text-muted-foreground"}`}>
          {ack.sentOn ? `Sent ${fmtDate(ack.sentOn)}.` : `Due by ${fmtDate(ack.dueBy)} — three working days from when it reached us.`}
        </p>
      )}
      {stage.kind === "outcome_letter" && !sentOn && (
        <p className="text-sm text-muted-foreground">
          What we found and what we will do, written to whoever raised it. The findings on each concern are on the Findings stage; the letter is yours to write from them.
        </p>
      )}
      {stage.kind === "duty_of_candour" && !sentOn && (
        <p className="text-sm text-muted-foreground">
          Regulation 20. Only where someone came to serious or lasting harm — Findings decides whether it applies. If it does not, mark this stage not needed with the reason.
        </p>
      )}
      <form action={action} className="space-y-3">
        <input type="hidden" name="complaintId" value={complaint.id} />
        <input type="hidden" name="stageId" value={stage.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`sub-${stage.id}`}>Subject</Label>
            <Input id={`sub-${stage.id}`} name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`to-${stage.id}`}>Sent to</Label>
            <Input id={`to-${stage.id}`} name="sentTo" value={sentTo} onChange={(e) => setSentTo(e.target.value)} disabled={disabled} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`body-${stage.id}`}>Letter</Label>
          <textarea id={`body-${stage.id}`} name="body" rows={14} className={`${textareaClass} font-mono text-xs`} value={body} onChange={(e) => setBody(e.target.value)} disabled={disabled} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor={`sent-${stage.id}`}>Date sent</Label>
            <Input id={`sent-${stage.id}`} name="sentOn" type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} disabled={disabled} />
          </div>
          {!disabled && (
            <>
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : sentOn ? "Save" : "Save (and mark sent if dated)"}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(`${subject}\n\n${body}`)}>Copy</Button>
            </>
          )}
        </div>
        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
        {state.ok && !state.error && <p className="text-sm text-teal-700">Saved.</p>}
      </form>
      <DocumentsBox complaint={complaint} stage={stage} entry={entry} staff={[]} organisationName={organisationName} senderName={senderName} today={today} disabled={disabled} />
      <NotNeeded complaint={complaint} stage={stage} entry={entry} staff={[]} organisationName={organisationName} senderName={senderName} today={today} disabled={disabled} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Findings: one per concern
// ---------------------------------------------------------------------------

function FindingsEditor({ complaint, stage, entry, disabled }: PanelProps) {
  const [list, setList] = useState<ConcernFinding[]>(() => {
    const saved = readConcernFindings(entry?.formAnswers ?? null);
    return saved.length ? saved : [{ id: crypto.randomUUID(), concern: "", why: "" }];
  });
  const [state, action, pending] = useActionState<SaveState, FormData>(saveFindingsAction, {});
  const outstanding = findingsOutstanding(list.filter((r) => r.concern.trim()));
  const update = (id: string, patch: Partial<ConcernFinding>) => setList((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="space-y-3 border-t pt-4">
      <input type="hidden" name="complaintId" value={complaint.id} />
      <input type="hidden" name="stageId" value={stage.id} />
      <input type="hidden" name="findings" value={JSON.stringify(list)} />
      <div>
        <p className="text-sm font-semibold">Our finding on each concern</p>
        <p className="text-xs text-muted-foreground">Each thing that was raised, in their words; what we found; and why. The response is written from these.</p>
      </div>
      {list.map((r, i) => (
        <div key={r.id} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Concern {i + 1}</span>
            {!disabled && list.length > 1 && (
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setList((l) => l.filter((x) => x.id !== r.id))}>Remove</button>
            )}
          </div>
          <Input placeholder="What was raised" value={r.concern} onChange={(e) => update(r.id, { concern: e.target.value })} disabled={disabled} />
          <div className="flex flex-wrap gap-2">
            {FINDING_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                title={o.hint}
                onClick={() => update(r.id, { finding: r.finding === o.value ? undefined : o.value })}
                className={`rounded-full border px-2 py-0.5 text-xs ${r.finding === o.value ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "bg-background text-muted-foreground"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <textarea rows={2} className={textareaClass} placeholder="Why — resting on the evidence" value={r.why} onChange={(e) => update(r.id, { why: e.target.value })} disabled={disabled} />
        </div>
      ))}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => setList((l) => [...l, { id: crypto.randomUUID(), concern: "", why: "" }])}>
          Add a concern
        </Button>
      )}
      {outstanding.length > 0 && <p className="text-xs text-amber-700">{outstanding.join("; ")}.</p>}
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && !state.error && <p className="text-sm text-teal-700">Saved.</p>}
      {!disabled && <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save findings"}</Button>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Actions agreed at a meeting, each with an owner and a date
// ---------------------------------------------------------------------------

function ActionsEditor({ complaint, stage, entry, staff, disabled, tag }: PanelProps & { tag: string }) {
  const mine = complaint.actions.filter((a) => a.stageTag === tag);
  const triage = isTriageStage(stage);
  const findings = holdsFindings(stage) && stage.kind === "meeting_minutes";
  const na = triage ? readTriageNa(entry?.formAnswers) : findings ? readFindingsNa(entry?.formAnswers) : {};
  const standing = triage ? [...TRIAGE_CHECKS] : findings ? [...FINDINGS_ACTIONS] : [];
  const have = new Set(mine.map((a) => a.title.trim().toLowerCase()));
  const unowned = triage ? triageChecksUnassigned(mine.map((a) => a.title), na) : standing.filter((c) => !have.has(c.toLowerCase()) && !na[c]);

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <p className="text-sm font-semibold">Actions and who is responsible</p>
        <p className="text-xs text-muted-foreground">
          {triage
            ? "Every concern gets the same five checks. Each one needs an owner and a date, or a reason it is not needed — Triage is not done until then."
            : findings
              ? "What is to be done with the staff member. None is required; mark the ones that do not apply."
              : "Agreed here, and shown in the owner's own list of what is outstanding."}
        </p>
      </div>

      {mine.map((a) => (
        <ActionRow key={a.id} action={a} complaintId={complaint.id} stageId={stage.id} disabled={disabled} />
      ))}

      {standing.length > 0 && (
        <div className="space-y-2">
          {standing.filter((c) => !have.has(c.toLowerCase())).map((c) => (
            <StandingCheck key={c} name={c} why={na[c]} complaint={complaint} stage={stage} staff={staff} disabled={disabled} />
          ))}
          {unowned.length === 0 && mine.length + Object.keys(na).length > 0 && (
            <p className="text-xs text-green-700">Every standing {triage ? "check" : "action"} has an owner or a reason.</p>
          )}
        </div>
      )}

      {!disabled && <AddAction complaint={complaint} stage={stage} staff={staff} />}
    </div>
  );
}

function ActionRow({ action: a, complaintId, stageId, disabled }: { action: ComplaintAction; complaintId: string; stageId: string; disabled: boolean }) {
  const [, doneAction, pending] = useActionState<SaveState, FormData>(setActionDoneAction, {});
  const [, delAction] = useActionState<SaveState, FormData>(deleteActionAction, {});
  const late = !a.completedAt && a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
      <form action={doneAction}>
        <input type="hidden" name="complaintId" value={complaintId} />
        <input type="hidden" name="actionId" value={a.id} />
        <input type="hidden" name="done" value={a.completedAt ? "0" : "1"} />
        <button type="submit" disabled={disabled || pending} className={`size-5 rounded border ${a.completedAt ? "bg-green-600 text-white" : "bg-background"}`} aria-label={a.completedAt ? "Mark not done" : "Mark done"}>
          {a.completedAt ? "✓" : ""}
        </button>
      </form>
      <span className={a.completedAt ? "text-muted-foreground line-through" : ""}>{a.title}</span>
      <span className="text-xs text-muted-foreground">
        {a.ownerName ?? "—"}
        {a.dueDate ? ` · by ${fmtDate(a.dueDate)}` : ""}
        {a.detail ? ` · ${a.detail}` : ""}
      </span>
      {late && <span className="text-xs font-medium text-rose-600">overdue</span>}
      {!disabled && (
        <form action={delAction} className="ml-auto">
          <input type="hidden" name="complaintId" value={complaintId} />
          <input type="hidden" name="actionId" value={a.id} />
          <input type="hidden" name="stageId" value={stageId} />
          <button type="submit" className="text-muted-foreground hover:text-foreground" aria-label="Remove"><Trash2 className="size-3.5" /></button>
        </form>
      )}
    </div>
  );
}

/** A standing check with nobody on it yet: give it an owner, or say why not. */
function StandingCheck({ name, why, complaint, stage, staff, disabled }: { name: string; why: string | undefined; complaint: Complaint; stage: ComplaintStage; staff: StaffOption[]; disabled: boolean }) {
  const [mode, setMode] = useState<"idle" | "own" | "na">("idle");
  const [addState, addAct, adding] = useActionState<SaveState, FormData>(addActionAction, {});
  const [naState, naAct, marking] = useActionState<SaveState, FormData>(markNotNeededAction, {});
  const hidden = (
    <>
      <input type="hidden" name="complaintId" value={complaint.id} />
      <input type="hidden" name="stageId" value={stage.id} />
    </>
  );

  if (why) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2 text-sm text-muted-foreground">
        <span className="line-through">{name}</span>
        <span className="text-xs">not needed — {why}</span>
        {!disabled && (
          <form action={naAct} className="ml-auto">
            {hidden}
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="clear" value="1" />
            <button type="submit" className="text-xs hover:underline" disabled={marking}>undo</button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>{name}</span>
        <span className="text-xs text-amber-700">nobody owns this yet</span>
        {!disabled && mode === "idle" && (
          <span className="ml-auto flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setMode("own")}>Give it an owner</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("na")}>Not needed</Button>
          </span>
        )}
      </div>
      {mode === "own" && (
        <form action={addAct} className="flex flex-wrap items-end gap-2">
          {hidden}
          <input type="hidden" name="title" value={name} />
          <select name="ownerId" className={`${selectClass} h-8 w-auto`} required defaultValue="">
            <option value="" disabled>Owner…</option>
            {staff.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Input name="dueDate" type="date" className="h-8 w-auto" required aria-label="Done by" title="Done by" />
          <Button type="submit" size="sm" disabled={adding}>Add</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
          {addState.error && <p className="w-full text-xs text-rose-600">{addState.error}</p>}
        </form>
      )}
      {mode === "na" && (
        <form action={naAct} className="flex flex-wrap items-end gap-2">
          {hidden}
          <input type="hidden" name="name" value={name} />
          <Input name="why" placeholder="Why it is not needed here" className="h-8 flex-1" required />
          <Button type="submit" size="sm" disabled={marking}>Mark</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
          {naState.error && <p className="w-full text-xs text-rose-600">{naState.error}</p>}
        </form>
      )}
    </div>
  );
}

function AddAction({ complaint, stage, staff }: { complaint: Complaint; stage: ComplaintStage; staff: StaffOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SaveState, FormData>(
    async (prev, fd) => {
      const r = await addActionAction(prev, fd);
      if (r.ok) setOpen(false);
      return r;
    },
    {},
  );
  if (!open) return <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Add another action</Button>;
  return (
    <form action={action} className="space-y-2 rounded-lg bg-muted/30 p-3">
      <input type="hidden" name="complaintId" value={complaint.id} />
      <input type="hidden" name="stageId" value={stage.id} />
      <Input name="title" placeholder="What is to be done" required />
      <div className="flex flex-wrap gap-2">
        <select name="ownerId" className={`${selectClass} w-auto`} required defaultValue="">
          <option value="" disabled>Owner…</option>
          {staff.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <Input name="dueDate" type="date" className="w-auto" required aria-label="Done by" title="Done by" />
        <Input name="detail" placeholder="Detail (optional)" className="flex-1" />
      </div>
      {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Documents against a stage
// ---------------------------------------------------------------------------

function DocumentsBox({ complaint, stage, disabled }: PanelProps) {
  const [upState, upload, uploading] = useActionState<SaveState, FormData>(uploadDocumentAction, {});
  const [, del] = useActionState<SaveState, FormData>(deleteDocumentAction, {});
  const docs = complaint.documents.filter((d) => d.stageId === stage.id);
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-semibold">Documents</p>
      {docs.length === 0 && <p className="text-xs text-muted-foreground">Nothing uploaded against this stage.</p>}
      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-2 text-sm">
          <FileText className="size-4 text-muted-foreground" />
          <a href={`/org/complaints/${complaint.id}/documents/${d.id}`} className="hover:underline" target="_blank" rel="noreferrer">{d.fileName}</a>
          <span className="text-xs text-muted-foreground">
            {d.fileSize ? `${Math.max(1, Math.round(d.fileSize / 1024))} KB · ` : ""}{formatDate(d.uploadedAt)}
          </span>
          {!disabled && (
            <form action={del} className="ml-auto">
              <input type="hidden" name="complaintId" value={complaint.id} />
              <input type="hidden" name="documentId" value={d.id} />
              <button type="submit" className="text-muted-foreground hover:text-foreground" aria-label="Delete"><Trash2 className="size-3.5" /></button>
            </form>
          )}
        </div>
      ))}
      {!disabled && (
        <form action={upload} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="complaintId" value={complaint.id} />
          <input type="hidden" name="stageId" value={stage.id} />
          <Input name="file" type="file" className="w-auto" required />
          <Button type="submit" size="sm" variant="outline" disabled={uploading}>{uploading ? "Uploading…" : "Upload"}</Button>
          {upState.error && <p className="w-full text-xs text-rose-600">{upState.error}</p>}
        </form>
      )}
    </div>
  );
}

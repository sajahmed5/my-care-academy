"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Circle, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/signature-pad";
import type { StaffOption } from "@/lib/complaints/data";
import { PIP_OUTCOMES, PIP_SUPPORT_TYPES, PIP_WEEK_RATINGS, label, type Pip, type PipReview } from "@/lib/pips/plan";
import type { PipNext, PipStep } from "@/lib/pips/steps";
import { fmtDate } from "@/app/org/complaints/complaint-row";
import { selectClass, textareaClass } from "@/app/org/complaints/new-complaint";
import { PlanForm } from "../plan-form";
import {
  addTrainingAction,
  addWeekAction,
  cancelPipAction,
  closePipAction,
  deleteTrainingAction,
  saveReviewAction,
  signCarerAction,
  signManagerAction,
} from "../actions";
import type { SaveState } from "@/app/platform/actions";
import { formatDate, formatDateTime } from "@/lib/dates";

const STATE_STYLE: Record<PipStep["state"], string> = {
  done: "border-green-200 bg-green-50",
  current: "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200",
  todo: "bg-card",
};

export function PipView({ pip, steps, next, staff, today }: { pip: Pip; steps: PipStep[]; next: PipNext; staff: StaffOption[]; today: string }) {
  const [editing, setEditing] = useState(false);
  const open = pip.status === "open";

  return (
    <div className="space-y-6">
      <div className={`rounded-lg p-3 text-sm ${next.late ? "bg-rose-50 text-rose-800" : "bg-indigo-50 text-indigo-900"}`}>
        <span className="font-medium">Next: </span>{next.text}
      </div>

      <ol className="grid gap-2 sm:grid-cols-4">
        {steps.map((s) => (
          <li key={s.key} className={`rounded-xl border p-3 text-sm ${STATE_STYLE[s.state]}`}>
            <div className="flex items-center gap-2">
              {s.state === "done" ? <Check className="size-4 text-green-700" /> : s.state === "current" ? <CircleDot className="size-4 text-indigo-700" /> : <Circle className="size-4 text-muted-foreground" />}
              <span className="font-medium">{s.n}. {s.title}</span>
            </div>
            {s.detail && <p className="pl-6 text-xs text-muted-foreground">{s.detail}</p>}
          </li>
        ))}
      </ol>

      {/* 1 — the plan */}
      {editing ? (
        <PlanForm pip={pip} staff={staff} onDone={() => setEditing(false)} />
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">The plan</p>
                <p className="text-xs text-muted-foreground">
                  {pip.startDate ? `From ${fmtDate(pip.startDate)}` : ""}{pip.reviewUntil ? ` to ${fmtDate(pip.reviewUntil)}` : ""}
                  {pip.durationWeeks ? ` · ${pip.durationWeeks} weeks` : ""}{pip.reviewFrequency ? `, reviewed ${pip.reviewFrequency}` : ""}
                  {pip.ownerName ? ` · owner ${pip.ownerName}` : ""}
                  {pip.complaintId && pip.complaintReference && (
                    <> · from <Link href={`/org/complaints/${pip.complaintId}`} className="underline">{pip.complaintReference}</Link></>
                  )}
                </p>
              </div>
              {open && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Amend</Button>}
            </div>
            <Section title="Why this plan is in place"><p className="whitespace-pre-line text-sm">{pip.reason}</p></Section>
            <Section title="Concerns, standards and how they are measured">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 pr-2">Concern</th><th className="py-1 pr-2">Standard</th><th className="py-1">Measured by</th></tr></thead>
                <tbody>
                  {pip.concerns.map((c) => (
                    <tr key={c.id} className="border-t"><td className="py-1 pr-2 align-top">{c.concern}</td><td className="py-1 pr-2 align-top">{c.standard}</td><td className="py-1 align-top">{c.measure}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>
            {pip.expectations.length > 0 && (
              <Section title="Expectations going forward">
                <ul className="list-disc pl-5 text-sm">{pip.expectations.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </Section>
            )}
            <Section title="Support offered">
              <ul className="space-y-1 text-sm">
                {pip.support.map((s) => (
                  <li key={s.id}><span className="font-medium">{label(PIP_SUPPORT_TYPES, s.type)}</span>{s.detail ? ` — ${s.detail}` : ""}{s.arranged ? <span className="ml-1 text-xs text-green-700">arranged</span> : <span className="ml-1 text-xs text-amber-700">not yet arranged</span>}</li>
                ))}
              </ul>
            </Section>
            {pip.consequences && <Section title="If the standards are not met"><p className="whitespace-pre-line text-sm">{pip.consequences}</p></Section>}
          </CardContent>
        </Card>
      )}

      {/* 2 — signatures */}
      <Card>
        <CardContent className="grid gap-6 pt-6 sm:grid-cols-2">
          <Signature
            title={`${pip.carerName} (the carer)`}
            signature={pip.carerSignature}
            signedAt={pip.carerSignedAt}
            by={pip.carerSignedWitnessedBy ? `witnessed by ${pip.carerSignedWitnessedBy}` : null}
            action={signCarerAction}
            pipId={pip.id}
            disabled={!open}
            witness
          />
          <Signature
            title="Manager"
            signature={pip.managerSignature}
            signedAt={pip.managerSignedAt}
            by={pip.managerSignedByName}
            action={signManagerAction}
            pipId={pip.id}
            disabled={!open}
          />
        </CardContent>
      </Card>

      {/* 3 — weekly reviews */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <p className="font-medium">Weekly reviews</p>
            {open && <AddWeek pipId={pip.id} />}
          </div>
          {pip.reviews.length === 0 && <p className="text-sm text-muted-foreground">No weeks yet.</p>}
          {/* Only the earliest week still to review opens by default. With every
              running week open, one week's Save sat directly above the next
              week's fields, as if it saved them too (#67). */}
          {pip.reviews.map((r) => (
            <ReviewRow
              key={r.id}
              pip={pip}
              review={r}
              today={today}
              disabled={!open}
              startOpen={r.id === pip.reviews.find((x) => !x.completedAt && x.periodStart <= today)?.id}
            />
          ))}
        </CardContent>
      </Card>

      {/* training */}
      <Training pip={pip} disabled={!open} />

      {/* 4 — outcome */}
      <Outcome pip={pip} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Signature({ title, signature, signedAt, by, action, pipId, disabled, witness }: {
  title: string; signature: string | null; signedAt: string | null; by: string | null;
  action: (prev: SaveState, fd: FormData) => Promise<SaveState>; pipId: string; disabled: boolean; witness?: boolean;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [state, act, pending] = useActionState<SaveState, FormData>(action, {});
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {signature ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signature} alt="Signature" className="h-20 rounded border bg-white" />
          <p className="text-xs text-muted-foreground">Signed {signedAt ? formatDateTime(signedAt) : ""}{by ? ` · ${by}` : ""}</p>
        </>
      ) : disabled ? (
        <p className="text-xs text-muted-foreground">Not signed.</p>
      ) : (
        <form action={act} className="space-y-2">
          <input type="hidden" name="pipId" value={pipId} />
          <input type="hidden" name="signature" value={dataUrl ?? ""} />
          <SignaturePad onChange={setDataUrl} />
          {witness && <Input name="witnessedBy" placeholder="Witnessed by (your name)" />}
          {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
          <Button type="submit" size="sm" disabled={pending || !dataUrl}>{pending ? "Saving…" : "Save signature"}</Button>
          {witness && <p className="text-xs text-muted-foreground">Signed here, in the office, with the carer present.</p>}
        </form>
      )}
    </div>
  );
}

function AddWeek({ pipId }: { pipId: string }) {
  const [state, act, pending] = useActionState<SaveState, FormData>(addWeekAction, {});
  return (
    <form action={act}>
      <input type="hidden" name="pipId" value={pipId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>Add a week</Button>
      {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}

function ReviewRow({
  pip,
  review: r,
  today,
  disabled,
  startOpen,
}: {
  pip: Pip;
  review: PipReview;
  today: string;
  disabled: boolean;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [state, act, pending] = useActionState<SaveState, FormData>(saveReviewAction, {});
  const late = !r.completedAt && r.periodEnd < today;
  const sessions = pip.training.filter((t) => t.reviewId === r.id);
  return (
    <div className={`rounded-lg border p-3 ${late ? "border-rose-200" : ""}`}>
      <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left text-sm" onClick={() => setOpen((o) => !o)}>
        <span className="font-medium">Week {r.weekNumber} <span className="font-normal text-muted-foreground">· {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</span></span>
        <span className={`text-xs ${r.completedAt ? "text-green-700" : late ? "text-rose-600" : "text-muted-foreground"}`}>
          {r.completedAt ? `Reviewed · ${label(PIP_WEEK_RATINGS, r.rating)}` : late ? "Overdue" : r.periodStart > today ? "Not started" : "Running"}
        </span>
      </button>
      {open && (
        <form action={act} className="mt-3 space-y-3">
          <input type="hidden" name="pipId" value={pip.id} />
          <input type="hidden" name="reviewId" value={r.id} />
          {sessions.length > 0 && (
            <p className="text-xs text-muted-foreground">Training this week: {sessions.map((s) => `${s.topic} (${fmtDate(s.sessionDate)})`).join(", ")}</p>
          )}
          <div className="space-y-1">
            <Label htmlFor={`mn-${r.id}`}>What you saw this week</Label>
            <textarea id={`mn-${r.id}`} name="managerNotes" rows={3} className={textareaClass} defaultValue={r.managerNotes ?? ""} disabled={disabled} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cr-${r.id}`}>The carer&apos;s response</Label>
            <textarea id={`cr-${r.id}`} name="carerResponse" rows={2} className={textareaClass} defaultValue={r.carerResponse ?? ""} disabled={disabled} placeholder="In their words — a plan they never engaged with is worth little at appeal." />
          </div>
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <div className="space-y-1">
              <Label htmlFor={`rt-${r.id}`}>How the week went</Label>
              <select id={`rt-${r.id}`} name="rating" className={selectClass} defaultValue={r.rating ?? ""} disabled={disabled}>
                <option value="">—</option>
                {PIP_WEEK_RATINGS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`an-${r.id}`}>Actions for next week</Label>
              <Input id={`an-${r.id}`} name="actionsNext" defaultValue={r.actionsNext ?? ""} disabled={disabled} />
            </div>
          </div>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          {!disabled && (
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
              {!r.completedAt && (
                <Button type="submit" size="sm" name="complete" value="1" disabled={pending}>Save and sign the week off</Button>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function Training({ pip, disabled }: { pip: Pip; disabled: boolean }) {
  const [adding, setAdding] = useState(false);
  const [state, act, pending] = useActionState<SaveState, FormData>(
    async (prev, fd) => {
      const r = await addTrainingAction(prev, fd);
      if (r.ok) setAdding(false);
      return r;
    },
    {},
  );
  const [, del] = useActionState<SaveState, FormData>(deleteTrainingAction, {});
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Training sessions</p>
            <p className="text-xs text-muted-foreground">The evidence the provider taught something, not only that it measured.</p>
          </div>
          {!disabled && !adding && <Button variant="outline" size="sm" onClick={() => setAdding(true)}>Add a session</Button>}
        </div>
        {adding && (
          <form action={act} className="space-y-2 rounded-lg bg-muted/30 p-3">
            <input type="hidden" name="pipId" value={pip.id} />
            <div className="grid gap-2 sm:grid-cols-3">
              <Input name="sessionDate" type="date" required />
              <Input name="topic" placeholder="Topic" required />
              <Input name="trainerName" placeholder="Trainer" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <select name="attended" className={selectClass} defaultValue="">
                <option value="">Not yet happened</option>
                <option value="yes">Attended</option>
                <option value="no">Did not attend</option>
              </select>
              <Input name="assessmentResult" placeholder="Assessment result, e.g. 8/10" />
              <select name="reviewId" className={selectClass} defaultValue="">
                <option value="">Not tied to a week</option>
                {pip.reviews.map((r) => <option key={r.id} value={r.id}>Week {r.weekNumber}</option>)}
              </select>
            </div>
            <Input name="notes" placeholder="Notes" />
            {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>Add</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        )}
        {pip.training.length === 0 && !adding && <p className="text-sm text-muted-foreground">None recorded.</p>}
        {pip.training.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{fmtDate(t.sessionDate)}</span>
            <span className="font-medium">{t.topic}</span>
            {t.trainerName && <span className="text-muted-foreground">· {t.trainerName}</span>}
            <span className={`text-xs ${t.attended === false ? "text-rose-600" : "text-muted-foreground"}`}>
              {t.attended === true ? "attended" : t.attended === false ? "did not attend" : "upcoming"}{t.assessmentResult ? ` · ${t.assessmentResult}` : ""}
            </span>
            {!disabled && (
              <form
                action={del}
                onSubmit={(e) => {
                  if (!window.confirm(`Remove the session "${t.topic}"?`)) e.preventDefault();
                }}
                className="ml-auto"
              >
                <input type="hidden" name="pipId" value={pip.id} />
                <input type="hidden" name="trainingId" value={t.id} />
                <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">remove</button>
              </form>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Outcome({ pip }: { pip: Pip }) {
  const [state, act, pending] = useActionState<SaveState, FormData>(closePipAction, {});
  const [cState, cancel, cancelling] = useActionState<SaveState, FormData>(cancelPipAction, {});
  if (pip.status !== "open") {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">{pip.status === "completed" ? `Outcome: ${label(PIP_OUTCOMES, pip.outcome)}` : "This plan was cancelled"}</p>
          {pip.outcomeNotes && <p className="whitespace-pre-line text-sm">{pip.outcomeNotes}</p>}
          {pip.outcomeNextStep && <p className="text-sm"><span className="font-medium">What follows:</span> {pip.outcomeNextStep}</p>}
          {pip.completionSummary && <Section title="Completion summary"><p className="whitespace-pre-line text-sm">{pip.completionSummary}</p></Section>}
          <p className="text-xs text-muted-foreground">{pip.closedAt ? `Closed ${formatDate(pip.closedAt)}.` : ""}</p>
          <form action={cancel}>
            <input type="hidden" name="pipId" value={pip.id} />
            <input type="hidden" name="reopen" value="1" />
            <Button type="submit" variant="ghost" size="sm" disabled={cancelling}>Reopen</Button>
            {cState.error && <p className="text-xs text-rose-600">{cState.error}</p>}
          </form>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <p className="font-medium">Outcome</p>
        <form action={act} className="space-y-3">
          <input type="hidden" name="pipId" value={pip.id} />
          <div className="flex flex-wrap gap-3">
            {PIP_OUTCOMES.map((o) => (
              <label key={o.value} className="flex items-center gap-1 text-sm"><input type="radio" name="outcome" value={o.value} required /> {o.label}</label>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="oc-notes">Why</Label>
            <textarea id="oc-notes" name="outcomeNotes" rows={3} required className={textareaClass} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oc-next">What follows (closed, extended, escalated)</Label>
            <Input id="oc-next" name="outcomeNextStep" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="oc-sum">Completion summary — the closing letter, for the file</Label>
            <textarea id="oc-sum" name="completionSummary" rows={5} className={textareaClass} />
          </div>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Closing…" : "Close the plan"}</Button>
          </div>
        </form>
        <form action={cancel} className="border-t pt-3">
          <input type="hidden" name="pipId" value={pip.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={cancelling}>Cancel this plan</Button>
          {cState.error && <p className="text-xs text-rose-600">{cState.error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

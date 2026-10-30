"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle, CircleDot, FileDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { Complaint, StaffOption } from "@/lib/complaints/data";
import type { ComplaintStage } from "@/lib/complaints/stages";
import { isUntriaged, kindLabel, statusLabel } from "@/lib/complaints/stages";
import type { Suggestion } from "@/lib/complaints/categories";
import type { ComplaintStep, NextStep } from "@/lib/complaints/steps";
import { isOptionalStage } from "@/lib/complaints/steps";
import { LETTER_KINDS } from "@/lib/complaints/compute";
import { formForStage } from "@/lib/complaints/forms";
import { fmtDate } from "../complaint-row";
import { StagePanel } from "./stage-panel";
import { CloseRecord, PeopleNamed } from "./record-panels";
import { ChangeType, RecordFacts, TriagePanel } from "./triage";
import { Reminders } from "./reminders";
import { Papers } from "./papers";
import type { ReadinessGap } from "@/lib/complaints/readiness";
import type { Reminder } from "@/lib/complaints/reminders";
import type { ClientOption } from "../new-complaint";

const STATE_STYLE: Record<ComplaintStep["state"], string> = {
  done: "border-green-200 bg-green-50",
  current: "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200",
  started: "border-amber-200 bg-amber-50",
  todo: "bg-card",
};

function StepIcon({ state }: { state: ComplaintStep["state"] }) {
  if (state === "done") return <Check className="size-4 text-green-700" />;
  if (state === "current") return <CircleDot className="size-4 text-indigo-700" />;
  return <Circle className="size-4 text-muted-foreground" />;
}

const ENTRY_STYLE: Record<string, string> = {
  done: "text-green-700",
  na: "text-muted-foreground line-through",
  pending: "text-muted-foreground",
};

/**
 * The record: facts at the top, the next thing to do under them, the seven
 * steps with their stages, and the open stage's panel.
 */
export function ComplaintProcess({
  complaint,
  stages,
  steps,
  next,
  closeMessage,
  staff,
  organisationName,
  senderName,
  today,
  initialStageId,
  clients,
  training,
  reminders,
  clientConcerns,
  readiness,
}: {
  complaint: Complaint;
  stages: ComplaintStage[];
  steps: ComplaintStep<ComplaintStage>[];
  next: NextStep;
  closeMessage: string;
  staff: StaffOption[];
  organisationName: string;
  senderName: string | null;
  today: string;
  initialStageId: string | null;
  clients: ClientOption[] | null;
  training: { userId: string; name: string | null; suggestions: Suggestion[] }[];
  reminders: Reminder[];
  clientConcerns: number;
  readiness: ReadinessGap[];
}) {
  const [openId, setOpenId] = useState<string | null>(initialStageId);
  const entryOf = (stageId: string) => complaint.stageEntries.find((e) => e.stageId === stageId);
  const openStage = stages.find((s) => s.id === openId) ?? null;
  const closed = complaint.status !== "open";
  const untriaged = isUntriaged(complaint.kind);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <p className="text-lg font-semibold">
                  {untriaged ? "Concern waiting to be looked at" : kindLabel(complaint.kind)}
                  {complaint.aboutName ? ` about ${complaint.aboutName}` : ""}
                </p>
                {!untriaged && !closed && <ChangeType complaint={complaint} />}
              </div>
              <p className="text-sm text-muted-foreground">
                Reported {fmtDate(complaint.reportedOn)}
                {complaint.raisedByName ? ` by ${complaint.raisedByName}` : ""}
                {complaint.raisedVia === "link" ? " through the online link" : ""}
                {complaint.raisedByContact ? ` (${complaint.raisedByContact})` : ""}
                {complaint.occurredOn ? ` · happened ${fmtDate(complaint.occurredOn)}` : ""}
                {complaint.completeBy ? ` · response due ${fmtDate(complaint.completeBy)}` : ""}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                complaint.status === "open" ? "bg-amber-100 text-amber-700" : complaint.status === "closed" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
              }`}
            >
              {statusLabel(complaint.status)}
              {complaint.closedOn ? ` ${fmtDate(complaint.closedOn)}` : ""}
            </span>
          </div>
          <RecordFacts complaint={complaint} clients={clients} disabled={closed} clientConcerns={clientConcerns} />
          <p className="whitespace-pre-line text-sm">{complaint.description}</p>
          {complaint.desiredOutcome && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Desired outcome:</span> {complaint.desiredOutcome}
            </p>
          )}
          <PeopleNamed complaint={complaint} staff={staff} disabled={closed} />
          {!untriaged && (
            <div className={`rounded-lg p-3 text-sm ${next.late ? "bg-rose-50 text-rose-800" : "bg-indigo-50 text-indigo-900"}`}>
              <span className="font-medium">Next: </span>
              {next.text}
            </div>
          )}
          {complaint.outcomeSummary && (
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <p><span className="font-medium">Outcome:</span> {complaint.outcomeSummary}</p>
              {complaint.lessonsLearned && <p className="mt-1"><span className="font-medium">Lessons:</span> {complaint.lessonsLearned}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Reminders complaintId={complaint.id} reminders={reminders} disabled={closed} />

      {untriaged ? (
        <div className="space-y-6">
          {!closed && <TriagePanel complaint={complaint} />}
          <CloseRecord complaint={complaint} stages={stages} closeMessage={closeMessage} onOpenStage={setOpenId} />
        </div>
      ) : (
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <ol className="space-y-2">
          {steps.map((step) => (
            <li key={step.key} className={`rounded-xl border p-3 ${STATE_STYLE[step.state]}`}>
              <div className="flex items-center gap-2">
                <StepIcon state={step.state} />
                <p className="text-sm font-medium">
                  {step.n}. {step.title}
                </p>
                {step.total > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {step.doneCount}/{step.total}
                  </span>
                )}
              </div>
              {step.stages.length > 0 && (
                <ul className="mt-2 space-y-1 pl-6">
                  {step.stages.map((s) => {
                    const e = entryOf(s.id);
                    const st = e?.status ?? "pending";
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setOpenId(s.id === openId ? null : s.id)}
                          className={`w-full text-left text-sm hover:underline ${ENTRY_STYLE[st]} ${s.id === openId ? "font-semibold" : ""}`}
                        >
                          {s.name}
                          {isOptionalStage(s) && <span className="ml-1 text-xs">(optional)</span>}
                          {st === "na" && <span className="ml-1 text-xs no-underline">· N/A</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {step.key === "close" && (
                <div className="mt-2 pl-6">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === "__close" ? null : "__close")}
                    className={`text-sm hover:underline ${closed ? "text-green-700" : "text-muted-foreground"} ${openId === "__close" ? "font-semibold" : ""}`}
                  >
                    {closed ? `Record ${complaint.status}` : "Close the record"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>

        <div>
          {openId === "__close" ? (
            <CloseRecord complaint={complaint} stages={stages} closeMessage={closeMessage} onOpenStage={setOpenId} />
          ) : openStage ? (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{openStage.name}</p>
                  {(formForStage(openStage) || LETTER_KINDS.has(openStage.kind)) && (
                    <a
                      href={`/org/complaints/${complaint.id}/pdf?stage=${openStage.id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <FileDown className="size-4" /> PDF
                    </a>
                  )}
                </div>
                <StagePanel
                  key={openStage.id}
                  complaint={complaint}
                  stage={openStage}
                  entry={entryOf(openStage.id)}
                  staff={staff}
                  organisationName={organisationName}
                  senderName={senderName}
                  today={today}
                  disabled={closed}
                  training={openStage.kind === "incident_actions" ? training : []}
                  readiness={openStage.kind === "outcome_letter" ? readiness : undefined}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Open a stage on the left to work on it.
                {complaint.pips.length > 0 && (
                  <p className="mt-3">
                    Plans from this record:{" "}
                    {complaint.pips.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && ", "}
                        <Link href={`/org/pips/${p.id}`} className="underline">
                          {p.carerName} ({p.status})
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      )}

      {!untriaged && <Papers complaint={complaint} />}
    </div>
  );
}

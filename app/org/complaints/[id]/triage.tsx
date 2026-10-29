"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COMPLAINT_KINDS, isUntriaged, kindLabel } from "@/lib/complaints/stages";
import { CONCERN_CATEGORIES, categoryLabel } from "@/lib/complaints/categories";
import type { Complaint } from "@/lib/complaints/data";
import { setCategoryAction, setClientAction, triageConcernAction } from "../actions";
import { selectClass } from "../new-complaint";
import type { ClientOption } from "../new-complaint";
import type { SaveState } from "@/app/platform/actions";

/** What happens next for each type, said where the choice is made. */
const PROCESS: Record<string, string> = {
  complaint: "Acknowledge in 3 working days, investigate, and respond in writing within 28.",
  safeguarding: "Keep the person safe, refer to the council's safeguarding team, notify CQC, the police if needed, then the council's outcome and lessons.",
  issue: "An action plan, then a monitoring review to check it worked.",
  accident: "What happened and who was hurt, whether RIDDOR applies, then actions and any training.",
  near_miss: "What happened and what would have, then actions so it does not happen.",
};

/**
 * Triage: which of the five this concern is. Shown in place of the process
 * until it is decided, since the process depends on it.
 */
export function TriagePanel({ complaint }: { complaint: Complaint }) {
  return (
    <Card className="border-violet-200">
      <CardContent className="space-y-3 pt-6">
        <div>
          <p className="font-medium">Triage this concern</p>
          <p className="text-sm text-muted-foreground">
            Decide what it is. Each type has its own process, which starts as soon as you choose. It can be changed later if the facts say otherwise.
          </p>
        </div>
        <KindChooser complaint={complaint} submitLabel="Triage it" />
      </CardContent>
    </Card>
  );
}

/** Move an open record to another type: what is already on it is kept. */
export function ChangeType({ complaint }: { complaint: Complaint }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-indigo-700 hover:underline">
        Change type
      </button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-lg border p-3">
      <p className="text-sm text-muted-foreground">
        It is a {kindLabel(complaint.kind).toLowerCase()} now. Move it to another type if the facts say it was triaged wrongly; everything already recorded stays on it.
      </p>
      <KindChooser complaint={complaint} submitLabel="Change type" onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
    </div>
  );
}

function KindChooser({
  complaint,
  submitLabel,
  onDone,
  onCancel,
}: {
  complaint: Complaint;
  submitLabel: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(async (prev, fd) => {
    const r = await triageConcernAction(prev, fd);
    if (r.ok) onDone?.();
    return r;
  }, {});
  const [kind, setKind] = useState(isUntriaged(complaint.kind) ? "" : complaint.kind);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="complaintId" value={complaint.id} />
      <div className="grid gap-2 sm:grid-cols-2">
        {COMPLAINT_KINDS.map((k) => (
          <label
            key={k.value}
            className={`flex cursor-pointer gap-2 rounded-lg border p-2 text-sm ${kind === k.value ? "border-indigo-300 bg-indigo-50" : "bg-background"}`}
          >
            <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="mt-1" />
            <span>
              <span className="font-medium">{k.label}</span>
              <span className="block text-xs text-muted-foreground">{k.hint}</span>
              <span className="mt-1 block text-xs">{PROCESS[k.value]}</span>
            </span>
          </label>
        ))}
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !kind || kind === complaint.kind}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
      </div>
    </form>
  );
}

/**
 * What it was about and which client, each changeable in place: both are
 * often only clear once someone has looked into it.
 */
export function RecordFacts({
  complaint,
  clients,
  disabled,
}: {
  complaint: Complaint;
  clients: ClientOption[] | null;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [catState, catAction, catPending] = useActionState<SaveState, FormData>(setCategoryAction, {});
  const [clState, clAction, clPending] = useActionState<SaveState, FormData>(setClientAction, {});

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">About: </span>
          {categoryLabel(complaint.category)}
        </span>
        {clients && (
          <span>
            <span className="text-muted-foreground">Client: </span>
            {complaint.client ? (
              <Link href={`/org/clients/${complaint.client.id}`} className="hover:underline">{complaint.client.name}</Link>
            ) : (
              "not linked"
            )}
          </span>
        )}
        {!disabled && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-indigo-700 hover:underline">
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3 text-sm">
      <form action={catAction} className="flex items-end gap-2">
        <input type="hidden" name="complaintId" value={complaint.id} />
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">What it was about</span>
          <select name="category" className={`${selectClass} h-8 w-auto`} defaultValue={complaint.category ?? ""}>
            <option value="">Not said</option>
            {CONCERN_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={catPending}>Save</Button>
        {catState.error && <span className="text-rose-600">{catState.error}</span>}
      </form>
      {clients && (
        <form action={clAction} className="flex items-end gap-2">
          <input type="hidden" name="complaintId" value={complaint.id} />
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Client</span>
            <select name="clientId" className={`${selectClass} h-8 w-auto`} defaultValue={complaint.client?.id ?? ""}>
              <option value="">Not about one client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={clPending}>Save</Button>
          {clState.error && <span className="text-rose-600">{clState.error}</span>}
        </form>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Done</Button>
    </div>
  );
}

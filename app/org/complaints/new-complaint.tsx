"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPLAINT_KINDS, RAISED_BY_ROLES, UNTRIAGED } from "@/lib/complaints/stages";
import { CONCERN_CATEGORIES } from "@/lib/complaints/categories";
import { COMPLAINT_NATURES } from "@/lib/complaints/forms";
import { createComplaintAction } from "./actions";
import type { SaveState } from "@/app/platform/actions";

export const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
export const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * The greyed example in the description box. It walks through what a CQC
 * inspector looks for in a complaint record (Regulation 16): what happened,
 * when and where, who was involved, the effect on the person, and what was
 * done straight away — in the complainant's words where possible.
 */
const DESCRIPTION_EXAMPLE = [
  "What happened, in their own words where possible: when and where, who was involved, the effect on the person receiving care, and anything already done about it.",
  "",
  "For example: Mrs A's daughter phoned on 3 March. She said the morning call on 2 March arrived at 9:40 instead of 8:00, and her mother had not had her 8am medication or breakfast until then. She was upset that no one rang to say the carer was late. The on-call coordinator apologised and checked Mrs A was well; no harm was found.",
].join("\n");

export interface ClientOption {
  id: string;
  name: string;
}

/**
 * The front door: raise a concern (COMPLAINTS-SAFEGUARDING.md). The type can
 * be left for triage — the default, since the person taking the call rarely
 * knows yet whether it is a complaint or a safeguarding concern — or chosen
 * now when it is plain, as an accident usually is. What is typed here becomes
 * the first stage of the process, so it is not asked for twice.
 */
export function ConcernForm({
  clients,
  person,
  clientId,
}: {
  clients: ClientOption[];
  /** Raised from a member of staff's file: they are named on it. */
  person?: { id: string; name: string } | null;
  clientId?: string | null;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(createComplaintAction, {});
  const [kind, setKind] = useState<string>(UNTRIAGED);
  const incident = kind === "accident" || kind === "near_miss";

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4">
          {person && <input type="hidden" name="personId" value={person.id} />}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What is it?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[{ value: UNTRIAGED, label: "Not sure yet", hint: "Raise it as a concern, and decide what it is later" }, ...COMPLAINT_KINDS].map((k) => (
                <label
                  key={k.value}
                  className={`flex cursor-pointer gap-2 rounded-lg border p-2 text-sm ${kind === k.value ? "border-indigo-300 bg-indigo-50" : "bg-background"}`}
                >
                  <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="mt-1" />
                  <span>
                    <span className="font-medium">{k.label}</span>
                    <span className="block text-xs text-muted-foreground">{k.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {/* Labels and rows as Norwood asked (#61): the two dates, then who
              raised it and their role, then the client and what it is about.
              Staff are named from the record itself, under "Staff named". */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nc-reported">Date raised</Label>
              <Input id="nc-reported" name="reportedOn" type="date" required defaultValue={todayISO()} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-occurred">Date it happened</Label>
              <Input id="nc-occurred" name="occurredOn" type="date" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nc-raised">{incident ? "Reported by" : "Raised by"}</Label>
              <Input id="nc-raised" name="raisedByName" placeholder="Their name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-role">Role</Label>
              <select id="nc-role" name="raisedByRole" className={selectClass} defaultValue="">
                <option value="">—</option>
                {RAISED_BY_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nc-client">Client</Label>
              {clients.length > 0 ? (
                <select id="nc-client" name="clientId" className={selectClass} defaultValue={clientId ?? ""}>
                  <option value="">Not about one client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <Input id="nc-client" name="aboutName" placeholder="The person receiving care" />
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-category">What it was about</Label>
              <select id="nc-category" name="category" className={selectClass} defaultValue="">
                <option value="">Choose…</option>
                {CONCERN_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          {/* The Complaint Form needs it, and choosing a member of staff used
              to answer it; asked here so the first stage is done on arrival. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nc-nature">Who or what it concerns</Label>
              <select id="nc-nature" name="nature" className={selectClass} required defaultValue={person ? "carer" : ""}>
                <option value="" disabled>Choose…</option>
                {COMPLAINT_NATURES.map((n) => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </select>
            </div>
            {person && (
              <div className="space-y-1">
                <Label>Staff named</Label>
                <p className="pt-2 text-sm">{person.name}</p>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="nc-desc">{incident ? "What happened" : "Detailed description"}</Label>
            <textarea
              id="nc-desc"
              name="description"
              rows={6}
              required
              maxLength={10000}
              className={`${textareaClass} placeholder:text-muted-foreground/70`}
              placeholder={incident ? "What happened, where, and who was involved." : DESCRIPTION_EXAMPLE}
            />
          </div>
          {!incident && (
            <div className="space-y-1">
              <Label htmlFor="nc-desired">Desired outcome</Label>
              <Input id="nc-desired" name="desiredOutcome" placeholder="What the person raising it would like to happen, e.g. an apology, a change of carer" />
            </div>
          )}
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : kind === UNTRIAGED ? "Raise it" : "Record it"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

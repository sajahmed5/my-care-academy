"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CHECK_RESULTS,
  intervalLabel,
  nextDueFrom,
  suggestedOutcome,
  type CheckForm as CheckFormDef,
  type CheckResult,
} from "@/lib/audit-forms";
import { COMPETENCY_OUTCOMES, SPOT_CHECK_OUTCOMES } from "@/lib/competency";
import { recordCompetencyAction, recordSpotCheckAction, type CheckState } from "./check-actions";
import { CarerSignatureFields } from "./signature-fields";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const selectClass = "flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base sm:h-9 sm:text-sm";

const RESULT_ON: Record<CheckResult, string> = {
  yes: "border-green-600 bg-green-50 text-green-800",
  no: "border-rose-600 bg-rose-50 text-rose-800",
  na: "border-slate-500 bg-slate-100 text-slate-700",
};
const OUTCOME_ON: Record<string, string> = {
  met: "border-green-600 bg-green-50 text-green-800",
  developing: "border-amber-600 bg-amber-50 text-amber-800",
  not_met: "border-rose-600 bg-rose-50 text-rose-800",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Row {
  result: CheckResult | null;
  comment: string;
}

export interface ClientOption {
  id: string;
  name: string;
  region: string | null;
}

/**
 * A checklist audit on a phone: a spot check in a client's home, or one
 * competency area. Each item is a row of big Yes / No / N/A buttons with a
 * comment, then the overall outcome (suggested from the answers, the
 * assessor's to change), what follows from it, and — for a spot check — the
 * carer's signature on the same screen.
 */
export function CheckForm({
  mode,
  userId,
  personName,
  forms,
  initialArea,
  clients,
}: {
  mode: "spot_check" | "competency";
  userId: string;
  personName: string;
  /** The spot check form, or every competency area. */
  forms: CheckFormDef[];
  initialArea?: string;
  /** Null when the company has no client list: the name is typed instead. */
  clients: ClientOption[] | null;
}) {
  const router = useRouter();
  const [area, setArea] = useState(initialArea && forms.some((f) => f.key === initialArea) ? initialArea : forms[0].key);
  const form = forms.find((f) => f.key === area) ?? forms[0];
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [outcome, setOutcome] = useState<string | null>(null);
  const [checkedOn, setCheckedOn] = useState(todayISO);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState("");

  const answers = form.items.map((i) => ({ id: i.id, result: rows[i.id]?.result ?? null, comment: rows[i.id]?.comment ?? "" }));
  const suggested = suggestedOutcome(answers);
  const shownOutcome = outcome ?? (answers.every((a) => a.result) ? suggested : null);
  const shownNextDue = nextDue ?? nextDueFrom(checkedOn || todayISO(), form.due);
  const outcomes = mode === "spot_check" ? SPOT_CHECK_OUTCOMES : COMPETENCY_OUTCOMES;

  const shownClients = useMemo(() => {
    if (!clients) return [];
    const q = clientQuery.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, clientQuery]);

  const action = mode === "spot_check" ? recordSpotCheckAction : recordCompetencyAction;
  const [state, formAction, pending] = useActionState<CheckState, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    if (r.ok) router.push(`/org/staff/${userId}?section=competency`);
    return r;
  }, {});

  const set = (id: string, patch: Partial<Row>) =>
    setRows((cur) => ({ ...cur, [id]: { result: cur[id]?.result ?? null, comment: cur[id]?.comment ?? "", ...patch } }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name={mode === "spot_check" ? "items" : "criteria"} value={JSON.stringify(answers)} />
      <input type="hidden" name="outcome" value={shownOutcome ?? ""} />
      {mode === "competency" && <input type="hidden" name="area" value={area} />}

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
          {mode === "competency" && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ck-area">Skill</Label>
              <select
                id="ck-area"
                className={selectClass}
                value={area}
                onChange={(e) => {
                  setArea(e.target.value);
                  setRows({});
                  setOutcome(null);
                  setNextDue(null);
                }}
              >
                {forms.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {mode === "spot_check" && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ck-client">Client</Label>
              {clients ? (
                <>
                  <Input
                    id="ck-client-search"
                    aria-label="Search clients"
                    placeholder="Search by name"
                    className="h-11 text-base sm:h-9 sm:text-sm"
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                  />
                  <select
                    id="ck-client"
                    name="clientId"
                    className={selectClass}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    required
                  >
                    <option value="">Pick the client…</option>
                    {shownClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.region ? ` — ${c.region}` : ""}
                      </option>
                    ))}
                  </select>
                  {clients.length === 0 && (
                    <p className="text-xs text-amber-700">No clients yet. Add them under Clients first, or ask a manager to.</p>
                  )}
                </>
              ) : (
                <Input id="ck-client" name="clientName" maxLength={200} required className="h-11 text-base sm:h-9 sm:text-sm" />
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="ck-on">{mode === "spot_check" ? "Done on" : "Assessed on"}</Label>
            <Input
              id="ck-on"
              name="checkedOn"
              type="date"
              required
              className="h-11 text-base sm:h-9 sm:text-sm"
              value={checkedOn}
              onChange={(e) => setCheckedOn(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ck-next">Next due</Label>
            <Input
              id="ck-next"
              name="nextDue"
              type="date"
              className="h-11 text-base sm:h-9 sm:text-sm"
              value={shownNextDue}
              onChange={(e) => setNextDue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{intervalLabel(form.due)} unless you change it.</p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{mode === "spot_check" ? "What you saw" : `${form.label}: criteria`}</h2>
        <Card>
          <CardContent className="divide-y p-0">
            {form.items.map((item) => {
              const r = rows[item.id];
              return (
                <div key={item.id} className="space-y-2 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    {item.help && <p className="text-xs text-muted-foreground">{item.help}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:flex">
                    {CHECK_RESULTS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        aria-pressed={r?.result === c.value}
                        aria-label={`${item.label}: ${c.label}`}
                        onClick={() => set(item.id, { result: c.value })}
                        className={`min-h-11 rounded-lg border px-4 text-sm font-medium sm:min-h-9 ${
                          r?.result === c.value ? RESULT_ON[c.value] : "bg-background"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <Input
                    aria-label={`Comment on ${item.label}`}
                    placeholder={r?.result === "no" ? "What was wrong? (needed)" : "Comment (optional)"}
                    maxLength={1000}
                    className="h-11 text-base sm:h-9 sm:text-sm"
                    value={r?.comment ?? ""}
                    onChange={(e) => set(item.id, { comment: e.target.value })}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Overall</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {outcomes.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={shownOutcome === o.value}
              onClick={() => setOutcome(o.value)}
              className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${shownOutcome === o.value ? OUTCOME_ON[o.value] : "bg-background"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {!outcome && shownOutcome && (
          <p className="text-xs text-muted-foreground">Suggested from the answers. Change it if your judgement differs.</p>
        )}
        {shownOutcome && shownOutcome !== "met" && (
          <p className="text-xs text-muted-foreground">
            Once saved, the file suggests training for you to confirm. Nothing is assigned until you do.
          </p>
        )}
        <div className="space-y-1">
          <Label htmlFor="ck-notes">Notes (optional)</Label>
          <textarea id="ck-notes" name="notes" rows={3} maxLength={5000} className={textareaClass} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor="ck-agreed">Actions — one per line (optional)</Label>
          <textarea id="ck-agreed" name="agreed" rows={2} className={textareaClass} placeholder="Shadow a senior on a medication call" />
          <p className="text-xs text-muted-foreground">Each line goes onto their task list.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ck-actions-due">Actions due by (optional)</Label>
          <Input id="ck-actions-due" name="actionsDue" type="date" className="h-11 text-base sm:h-9 sm:text-sm" />
        </div>
      </section>

      {mode === "spot_check" && (
        <CarerSignatureFields
          name={personName}
          idPrefix="ck"
          prompt="Pass them the phone to sign that they have seen what was recorded."
        />
      )}

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <Button type="submit" disabled={pending} className="h-11 w-full sm:h-9 sm:w-auto">
        {pending ? "Saving…" : mode === "spot_check" ? "Save the spot check" : "Save the assessment"}
      </Button>
    </form>
  );
}

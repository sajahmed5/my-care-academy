"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { intervalLabel, nextDueFrom } from "@/lib/audit-forms";
import { RATING_MAX, type ItemAnswer, type ServiceQuestion } from "@/lib/service-audits";
import { QA_HEADINGS, QA_METHODS, QA_RATING_MAX, QA_WITH, qaScore, type QaForm, type QaHeading } from "@/lib/client-qa";
import type { SaveState } from "@/app/platform/actions";
import { ManagerSignatureFields } from "../../../staff/[userId]/signature-fields";
import { saveClientQaAction } from "../actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm";
const selectClass = "flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base sm:h-9 sm:text-sm";
const field = "h-11 text-base sm:h-9 sm:text-sm";
const chip = (on: boolean) => `min-h-11 rounded-lg border px-4 text-sm font-medium sm:min-h-9 ${on ? "border-foreground bg-foreground text-background" : "bg-background"}`;

export interface QaClient {
  id: string;
  name: string;
  region: string | null;
  medicationSupport: boolean;
}

interface Row {
  answer: ItemAnswer;
  comment: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * A client QA, on a phone or at a desk: how it was done and who with, or why
 * it couldn't be; a 1–10 rating under each of CQC's five headings; the
 * medication questions for a client helped with medicines; the company's own
 * questions; what we do well and better; an action plan; the signature.
 */
export function ClientQaForm({
  form,
  clients,
  initialClient,
  staff,
  me,
  reviewBelow,
}: {
  form: QaForm;
  clients: QaClient[];
  initialClient: string | null;
  staff: { id: string; name: string }[];
  me: { id: string; name: string };
  reviewBelow: number;
}) {
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState(initialClient ?? "");
  const [heldOn, setHeldOn] = useState(todayISO);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [method, setMethod] = useState<string>("visit");
  const [completed, setCompleted] = useState(true);
  const [withWhom, setWithWhom] = useState<string>("client");
  const [ratings, setRatings] = useState<Partial<Record<QaHeading, number>>>({});
  const [medication, setMedication] = useState<Record<string, Row>>({});
  const [extra, setExtra] = useState<Record<string, Row>>({});
  const [state, formAction, pending] = useActionState<SaveState, FormData>(saveClientQaAction, {});

  const client = clients.find((c) => c.id === clientId);
  const askMedication = !!client?.medicationSupport && form.medication.length > 0;
  const score = qaScore(ratings);
  const shownNext = nextDue ?? nextDueFrom(heldOn || todayISO(), form.due);
  const shownClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, clientQuery]);
  const items = (qs: ServiceQuestion[], rows: Record<string, Row>) =>
    qs.map((q) => ({ id: q.id, answer: rows[q.id]?.answer ?? null, comment: rows[q.id]?.comment ?? "" }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="completed" value={completed ? "1" : "0"} />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="withWhom" value={withWhom} />
      <input type="hidden" name="medication" value={JSON.stringify(items(form.medication, medication))} />
      <input type="hidden" name="extra" value={JSON.stringify(items(form.own, extra))} />
      {QA_HEADINGS.map((h) => (
        <input key={h.key} type="hidden" name={`rating_${h.key}`} value={ratings[h.key] ?? ""} />
      ))}

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="qa-client">Client</Label>
            <Input aria-label="Search clients" placeholder="Search by name" className={field} value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} />
            <select id="qa-client" name="clientId" className={selectClass} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Pick the client…</option>
              {shownClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.region ? ` — ${c.region}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="qa-held">Done on</Label>
            <Input id="qa-held" name="heldOn" type="date" max={todayISO()} required className={field} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qa-next">Next one due</Label>
            <Input id="qa-next" name="nextDue" type="date" className={field} value={shownNext} onChange={(e) => setNextDue(e.target.value)} />
            <p className="text-xs text-muted-foreground">{intervalLabel(form.due)} unless you change it.</p>
          </div>
          <fieldset className="space-y-1 sm:col-span-2">
            <legend className="text-sm font-medium">How</legend>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {QA_METHODS.map((m) => (
                <button key={m.value} type="button" aria-pressed={method === m.value} onClick={() => setMethod(m.value)} className={chip(method === m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2 sm:min-h-0">
            <input type="checkbox" checked={!completed} onChange={(e) => setCompleted(!e.target.checked)} />
            It couldn&apos;t be done
          </label>
        </CardContent>
      </Card>

      {!completed ? (
        <Card>
          <CardContent className="space-y-1 pt-6">
            <Label htmlFor="qa-why">Why it couldn&apos;t be done</Label>
            <textarea id="qa-why" name="notDoneReason" rows={3} required maxLength={1000} className={textareaClass} placeholder="No answer after three calls on different days; a message was left." />
            <p className="text-xs text-muted-foreground">It still counts as attempted, and the next one falls due from today.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
              <fieldset className="space-y-1 sm:col-span-2">
                <legend className="text-sm font-medium">Who with</legend>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  {QA_WITH.map((w) => (
                    <button key={w.value} type="button" aria-pressed={withWhom === w.value} onClick={() => setWithWhom(w.value)} className={chip(withWhom === w.value)}>
                      {w.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              {withWhom === "family" && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="qa-fam-name">Their name (optional)</Label>
                    <Input id="qa-fam-name" name="familyName" maxLength={120} className={field} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="qa-fam-rel">Relationship to the client</Label>
                    <Input id="qa-fam-rel" name="familyRelationship" maxLength={80} required className={field} placeholder="Daughter" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Ratings, 1 to {QA_RATING_MAX}</h2>
            <Card>
              <CardContent className="divide-y p-0">
                {QA_HEADINGS.map((h) => (
                  <div key={h.key} className="space-y-2 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{h.label}</p>
                      <p className="text-xs text-muted-foreground">{h.prompt}</p>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 sm:flex">
                      {Array.from({ length: QA_RATING_MAX }, (_, i) => i + 1).map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={ratings[h.key] === v}
                          aria-label={`${h.label}: ${v}`}
                          onClick={() => setRatings((r) => ({ ...r, [h.key]: v }))}
                          className={`min-h-11 rounded-lg border text-sm font-medium sm:min-h-9 sm:w-9 ${
                            ratings[h.key] === v ? (v <= 4 ? "border-rose-600 bg-rose-50 text-rose-800" : "border-foreground bg-foreground text-background") : "bg-background"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          {askMedication && <Questions title="Medication" questions={form.medication} rows={medication} onChange={setMedication} />}
          {form.own.length > 0 && <Questions title="Your questions" questions={form.own} rows={extra} onChange={setExtra} />}

          <section className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="qa-well">What do we do well?</Label>
              <textarea id="qa-well" name="wentWell" rows={3} maxLength={5000} className={textareaClass} />
              <p className="text-xs text-muted-foreground">Praise for a carer can go to the compliments log in one click once saved.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qa-better">What can we do better?</Label>
              <textarea id="qa-better" name="doBetter" rows={3} maxLength={5000} className={textareaClass} />
              <p className="text-xs text-muted-foreground">A problem can be raised as a concern in one click once saved.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qa-plan">Action plan for the office</Label>
              <textarea id="qa-plan" name="actionPlan" rows={3} maxLength={5000} className={textareaClass} />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <div className="space-y-1">
              <Label htmlFor="qa-agreed">Actions — one per line (optional)</Label>
              <textarea id="qa-agreed" name="agreed" rows={2} className={textareaClass} placeholder="Ring the GP about the new prescription" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qa-owner">For</Label>
              <select id="qa-owner" name="actionOwner" className={selectClass} defaultValue={me.id}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qa-actions-due">By (optional)</Label>
              <Input id="qa-actions-due" name="actionsDue" type="date" className={field} />
            </div>
          </section>
        </>
      )}

      <ManagerSignatureFields defaultName={me.name} idPrefix="qa" />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending} className="h-11 w-full sm:h-9 sm:w-auto">
          {pending ? "Saving…" : "Sign off and save"}
        </Button>
        {completed && score !== null && (
          <span className="text-xs text-muted-foreground">
            {score}%{score < reviewBelow ? ` · below ${reviewBelow}%, so a manager will review it` : ""}
          </span>
        )}
        {state.error && <span className="w-full text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}

const YES_NO: { value: "yes" | "no" | "na"; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "N/A" },
];

function Questions({
  title,
  questions,
  rows,
  onChange,
}: {
  title: string;
  questions: ServiceQuestion[];
  rows: Record<string, Row>;
  onChange: (fn: (cur: Record<string, Row>) => Record<string, Row>) => void;
}) {
  const set = (id: string, patch: Partial<Row>) =>
    onChange((cur) => ({ ...cur, [id]: { answer: cur[id]?.answer ?? null, comment: cur[id]?.comment ?? "", ...patch } }));
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <Card>
        <CardContent className="divide-y p-0">
          {questions.map((q) => {
            const r = rows[q.id];
            return (
              <div key={q.id} className="space-y-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{q.label}</p>
                  {q.help && <p className="text-xs text-muted-foreground">{q.help}</p>}
                </div>
                {q.type === "yes_no" && (
                  <div className="grid grid-cols-3 gap-2 sm:flex">
                    {YES_NO.map((o) => (
                      <button key={o.value} type="button" aria-pressed={r?.answer === o.value} aria-label={`${q.label}: ${o.label}`} onClick={() => set(q.id, { answer: o.value })} className={chip(r?.answer === o.value)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === "rating" && (
                  <div className="flex gap-2">
                    {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((v) => (
                      <button key={v} type="button" aria-pressed={r?.answer === v} aria-label={`${q.label}: ${v} of ${RATING_MAX}`} onClick={() => set(q.id, { answer: v })} className={`${chip(r?.answer === v)} w-11 px-0 sm:w-9`}>
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === "text" ? (
                  <textarea aria-label={q.label} rows={2} maxLength={5000} className={textareaClass} value={typeof r?.answer === "string" ? r.answer : ""} onChange={(e) => set(q.id, { answer: e.target.value })} />
                ) : (
                  <Input aria-label={`Comment on ${q.label}`} placeholder="Comment (optional)" maxLength={1000} className={field} value={r?.comment ?? ""} onChange={(e) => set(q.id, { comment: e.target.value })} />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}

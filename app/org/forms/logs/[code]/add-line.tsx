"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isFieldVisible, isOutOfRange, rangeLabel, type FormField } from "@/lib/forms";
import type { SubmitState } from "@/app/learn/forms/actions";
import { addLogLineAction } from "../actions";

const selectClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Add a line to a log: the date (today), who did it (you, or anyone on the
 * staff list, or a name for someone who is not), the client on a log about
 * residents, then the log's own columns. A reading outside its range is
 * flagged as it is typed, so the action box gets filled in there and then.
 */
export function AddLogLine({
  templateId,
  fields,
  personLabel,
  staff,
  clients,
  meId,
  today,
}: {
  templateId: string;
  fields: FormField[];
  personLabel: string;
  staff: { id: string; name: string }[];
  /** Null on a log that is not about clients. */
  clients: { id: string; name: string }[] | null;
  meId: string;
  today: string;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [who, setWho] = useState(meId);
  const [round, setRound] = useState(0);
  const [state, action, pending] = useActionState<SubmitState, FormData>(addLogLineAction, {});
  const set = (id: string, v: unknown) => setValues((p) => ({ ...p, [id]: v }));
  const missing = new Set(state.missing ?? []);

  // A saved line clears the form for the next one — adjusted while
  // rendering, when a new result arrives, rather than in an effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) {
      setValues({});
      setRound((r) => r + 1);
    }
  }

  const visible = fields.filter((f) => f.type !== "signature" && isFieldVisible(f, values));

  return (
    <Card>
      <CardContent className="pt-6">
        <form key={round} action={action} className="space-y-4">
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="answers" value={JSON.stringify(values)} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="log-date">Date</Label>
              <Input id="log-date" type="date" name="entryDate" defaultValue={today} max={today} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="log-who">{personLabel}</Label>
              <select id="log-who" name="doneBy" className={selectClass} value={who} onChange={(e) => setWho(e.target.value)}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.id === meId ? `${s.name} (you)` : s.name}</option>
                ))}
                <option value="">Someone not on the staff list…</option>
              </select>
              {who === "" && <Input name="doneByName" placeholder="Their name" aria-label="Their name" required />}
            </div>
            {clients && (
              <div className="space-y-1">
                <Label htmlFor="log-client">Client</Label>
                <select id="log-client" name="clientId" required className={selectClass} defaultValue="">
                  <option value="">Choose…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((f) => {
              const id = `log-${f.id}`;
              const wide = f.type === "textarea" || f.type === "checkbox";
              const flagged = isOutOfRange(f, values[f.id]);
              const range = f.type === "number" ? rangeLabel(f) : null;
              return (
                <div key={f.id} className={`space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
                  <Label htmlFor={id} className={missing.has(f.label) ? "text-rose-600" : undefined}>
                    {f.label}
                    {f.required && <span aria-hidden> *</span>}
                    {range && <span className="font-normal text-muted-foreground"> · safe range {range}</span>}
                  </Label>
                  {(f.type === "text" || f.type === "number" || f.type === "date") && (
                    <Input
                      id={id}
                      type={f.type === "text" ? "text" : f.type}
                      step={f.type === "number" ? "any" : undefined}
                      value={String(values[f.id] ?? "")}
                      onChange={(e) => set(f.id, e.target.value)}
                      aria-invalid={flagged || undefined}
                      className={flagged ? "border-rose-500" : undefined}
                    />
                  )}
                  {flagged && <p className="text-xs font-medium text-rose-600">Out of range — say what was done about it.</p>}
                  {f.type === "textarea" && (
                    <textarea id={id} rows={2} className={textareaClass} value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
                  )}
                  {f.type === "select" && (
                    <select id={id} className={selectClass} value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)}>
                      <option value="">Choose…</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  )}
                  {f.type === "radio" && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {f.options.map((o) => (
                        <label key={o} className="flex items-center gap-1.5 text-sm">
                          <input type="radio" name={id} checked={values[f.id] === o} onChange={() => set(f.id, o)} />
                          {o}
                        </label>
                      ))}
                    </div>
                  )}
                  {f.type === "checkbox" && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {f.options.map((o) => {
                        const cur = Array.isArray(values[f.id]) ? (values[f.id] as string[]) : [];
                        return (
                          <label key={o} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              checked={cur.includes(o)}
                              onChange={(e) => set(f.id, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))}
                            />
                            {o}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {f.type === "file" && (
                    <Input
                      id={id}
                      type="file"
                      name={`file_${f.id}`}
                      accept="image/*,application/pdf"
                      onChange={(e) => set(f.id, e.target.files?.[0] ? { pending: e.target.files[0].name } : undefined)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {state.error && (
            <p className="text-sm text-rose-600">
              {state.error}
              {state.missing?.length ? ` Still needed: ${state.missing.join(", ")}.` : ""}
            </p>
          )}
          {state.ok && <p className="text-sm text-teal-700">Added. The next line starts afresh.</p>}
          <Button type="submit" disabled={pending}>
            <Plus className="size-4" />
            {pending ? "Adding…" : "Add the line"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

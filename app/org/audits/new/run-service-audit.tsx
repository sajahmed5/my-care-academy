"use client";

import { useActionState, useMemo, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { intervalLabel, nextDueFrom } from "@/lib/audit-forms";
import { RATING_MAX, itemFindings, itemsTally, type ItemAnswer, type ServiceAuditForm } from "@/lib/service-audits";
import { autoTally, combinedScore, type AutoSnapshot } from "@/lib/auto-audits";
import { AutoTable } from "../auto-table";
import type { SaveState } from "@/app/platform/actions";
import { ManagerSignatureFields } from "../../staff/[userId]/signature-fields";
import { saveServiceAuditAction } from "../actions";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm";
const selectClass = "flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base sm:h-9 sm:text-sm";
const field = "h-11 text-base sm:h-9 sm:text-sm";

const YES_NO: { value: "yes" | "no" | "na"; label: string; on: string }[] = [
  { value: "yes", label: "Yes", on: "border-green-600 bg-green-50 text-green-800" },
  { value: "no", label: "No", on: "border-rose-600 bg-rose-50 text-rose-800" },
  { value: "na", label: "N/A", on: "border-slate-500 bg-slate-100 text-slate-700" },
];

export interface ClientOption {
  id: string;
  name: string;
  region: string | null;
}

interface Row {
  answer: ItemAnswer;
  comment: string;
}

/**
 * A phone photo can be 5 MB; the audit only needs to show what was seen.
 * Scaled to 1600 pixels on its long side and saved as a JPEG, it is a few
 * hundred kilobytes and several fit in one save.
 */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No image"))), "image/jpeg", 0.8));
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Carry out one audit, on a phone in a client's home or at a desk: the
 * client (for an audit about one person), each question by its type, an
 * owner for anything that falls short, and the auditor's signature.
 */
export function RunServiceAudit({
  form,
  clients,
  initialClient,
  staff,
  auditorName,
  reviewBelow,
  auto,
}: {
  form: ServiceAuditForm;
  clients: ClientOption[];
  initialClient: string | null;
  staff: { id: string; name: string }[];
  auditorName: string;
  reviewBelow: number;
  /** For the staff file and training audits: what the site found. */
  auto?: AutoSnapshot | null;
}) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [photos, setPhotos] = useState<Record<string, { blob: Blob; url: string }>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [heldOn, setHeldOn] = useState(todayISO);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState(initialClient ?? "");

  const items = form.questions.map((q) => ({ id: q.id, label: q.label, type: q.type, answer: rows[q.id]?.answer ?? null, comment: rows[q.id]?.comment ?? "" }));
  const score = combinedScore(autoTally(auto ?? null), itemsTally(items));
  const findings = new Set(itemFindings(items).map((f) => f.id));
  const toAnswer = form.questions.filter((q) => q.type === "yes_no" || q.type === "rating");
  const answered = toAnswer.filter((q) => rows[q.id]?.answer != null).length;
  const shownNext = nextDue ?? nextDueFrom(heldOn || todayISO(), form.due);

  const shownClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, clientQuery]);

  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (prev, fd) => {
    for (const [id, p] of Object.entries(photos)) fd.set(`photo_${id}`, p.blob, `${id}.jpg`);
    return saveServiceAuditAction(prev, fd);
  }, {});

  const set = (id: string, patch: Partial<Row>) =>
    setRows((cur) => ({ ...cur, [id]: { answer: cur[id]?.answer ?? null, comment: cur[id]?.comment ?? "", ...patch } }));

  async function takePhoto(id: string, file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    try {
      const blob = await shrink(file);
      setPhotos((cur) => ({ ...cur, [id]: { blob, url: URL.createObjectURL(blob) } }));
    } catch {
      setPhotoError("That photo couldn't be read. Try taking it again.");
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="form" value={form.key} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
          {form.scope === "client" && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sa-client">Client</Label>
              <Input
                aria-label="Search clients"
                placeholder="Search by name"
                className={field}
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
              />
              <select id="sa-client" name="clientId" className={selectClass} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Pick the client…</option>
                {shownClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.region ? ` — ${c.region}` : ""}
                  </option>
                ))}
              </select>
              {clients.length === 0 && (
                <p className="text-xs text-amber-700">
                  {form.medicationOnly
                    ? "No clients are marked as having help with their medicines. Tick it on the client's page."
                    : "No clients yet. Add them under Clients first."}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="sa-held">Carried out on</Label>
            <Input id="sa-held" name="heldOn" type="date" max={todayISO()} required className={field} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sa-next">Next one due</Label>
            <Input id="sa-next" name="nextDue" type="date" className={field} value={shownNext} onChange={(e) => setNextDue(e.target.value)} />
            <p className="text-xs text-muted-foreground">{intervalLabel(form.due)} unless you change it.</p>
          </div>
        </CardContent>
      </Card>

      {auto && (
        <AutoTable
          snapshot={auto}
          action={(personId) => (
            <div className="grid gap-2 text-xs sm:grid-cols-[1fr_auto] sm:items-center">
              <select name={`owner_person_${personId}`} className={selectClass} defaultValue="" aria-label="Who will put it right">
                <option value="">Action: no owner — note it only</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    Action: {s.name}
                  </option>
                ))}
              </select>
              <Input name={`due_person_${personId}`} type="date" className={`${field} sm:w-auto`} aria-label="Done by" />
            </div>
          )}
        />
      )}

      {form.questions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">{auto ? "Your checks" : "Questions"}</h2>
          <Card>
            <CardContent className="divide-y p-0">
              {form.questions.map((q, n) => {
                const r = rows[q.id];
                const short = findings.has(q.id);
                return (
                  <div key={q.id} className={`space-y-2 px-4 py-3 ${short ? "bg-rose-50/40" : ""}`}>
                    <div>
                      <p className="text-sm font-medium">
                        {n + 1}. {q.label}
                      </p>
                      {q.help && <p className="text-xs text-muted-foreground">{q.help}</p>}
                    </div>

                    {q.type === "yes_no" && (
                      <div className="grid grid-cols-3 gap-2 sm:flex">
                        {YES_NO.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            aria-pressed={r?.answer === o.value}
                            aria-label={`${q.label}: ${o.label}`}
                            onClick={() => set(q.id, { answer: o.value })}
                            className={`min-h-11 rounded-lg border px-4 text-sm font-medium sm:min-h-9 ${r?.answer === o.value ? o.on : "bg-background"}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.type === "rating" && (
                      <div className="flex gap-2">
                        {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((v) => (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={r?.answer === v}
                            aria-label={`${q.label}: ${v} of ${RATING_MAX}`}
                            onClick={() => set(q.id, { answer: v })}
                            className={`min-h-11 w-11 rounded-lg border text-sm font-medium sm:min-h-9 sm:w-9 ${
                              r?.answer === v ? (v <= 2 ? "border-rose-600 bg-rose-50 text-rose-800" : "border-foreground bg-foreground text-background") : "bg-background"
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.type === "text" && (
                      <textarea
                        aria-label={q.label}
                        rows={3}
                        maxLength={5000}
                        className={textareaClass}
                        value={typeof r?.answer === "string" ? r.answer : ""}
                        onChange={(e) => set(q.id, { answer: e.target.value })}
                      />
                    )}

                    {q.type === "photo" && (
                      <div className="space-y-2">
                        {photos[q.id] ? (
                          <div className="relative inline-block">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, never optimised */}
                            <img src={photos[q.id].url} alt={q.label} className="max-h-48 rounded-lg border" />
                            <button
                              type="button"
                              aria-label="Remove the photo"
                              onClick={() => setPhotos(({ [q.id]: _gone, ...rest }) => rest)}
                              className="absolute right-1 top-1 rounded-full bg-background/90 p-1"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium sm:min-h-9">
                            <Camera className="size-4" /> Take or choose a photo
                            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => takePhoto(q.id, e.target.files?.[0])} />
                          </label>
                        )}
                      </div>
                    )}

                    {q.type !== "text" && (
                      <Input
                        aria-label={`Comment on ${q.label}`}
                        placeholder={short ? "What was wrong?" : "Comment (optional)"}
                        maxLength={1000}
                        className={field}
                        value={r?.comment ?? ""}
                        onChange={(e) => set(q.id, { comment: e.target.value })}
                      />
                    )}

                    {short && (
                      <div className="grid gap-2 text-xs sm:grid-cols-[1fr_auto] sm:items-center">
                        <select name={`owner_${q.id}`} className={selectClass} defaultValue="" aria-label={`Who will act on ${q.label}`}>
                          <option value="">Action: no owner — note it only</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              Action: {s.name}
                            </option>
                          ))}
                        </select>
                        <Input name={`due_${q.id}`} type="date" className={`${field} sm:w-auto`} aria-label="Done by" />
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          {photoError && <p className="text-sm text-rose-600">{photoError}</p>}
        </section>
      )}

      <div className="space-y-1">
        <Label htmlFor="sa-notes">Notes (optional)</Label>
        <textarea id="sa-notes" name="notes" rows={3} maxLength={5000} className={textareaClass} />
      </div>

      <ManagerSignatureFields defaultName={auditorName} idPrefix="sa" />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending || answered < toAnswer.length} className="h-11 w-full sm:h-9 sm:w-auto">
          {pending ? "Saving…" : "Sign off and save"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {answered} of {toAnswer.length} answered
          {score !== null ? ` · ${score}%` : ""}
          {score !== null && score < reviewBelow ? ` · below ${reviewBelow}%, so a manager will review it` : ""}
        </span>
        {state.error && <span className="w-full text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}

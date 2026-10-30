"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isFieldVisible, type FormField } from "@/lib/forms";
import { SIGNER_ROLES, type SignerRole } from "@/lib/form-records";
import { SignaturePad } from "@/app/org/forms/[id]/fill/signature-pad";
import { submitFormRecordAction } from "@/app/org/forms/record-actions";
import { submitFormResponseAction, type SubmitState } from "../actions";

const inputClass =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Fill a form in. Answers are kept in one object and sent as one JSON field,
 * validated again on the server. A signature is a typed name: good enough for
 * "I confirm this is mine", and far more reliable on a phone than a canvas.
 *
 * Two ways in. A carer form answers an ask (`assignmentId`). A client or
 * company form is a record the office fills in (`record`), and a client form
 * can also be signed on the device by the client or their family — drawn
 * with a finger, beside the staff member's typed name.
 */
export function FormComplete({
  assignmentId,
  record,
  fields,
  initialValues,
  doneMessage = "Thank you — your answers are saved and your manager can see them.",
  doneHref,
  doneLabel = "Back",
}: {
  assignmentId?: string;
  record?: {
    templateId: string;
    clientId?: string;
    deviceSigning?: boolean;
    /** The review date it starts with; undefined for a form that is never reviewed. */
    reviewDue?: string | null;
    /** The earlier record this one reviews. */
    reviewOf?: string;
  };
  fields: FormField[];
  /** Answers to start from — the previous version, when a form is reviewed. */
  initialValues?: Record<string, unknown>;
  /** What to say once saved; a manager completing their own form reads differently. */
  doneMessage?: string;
  doneHref?: string;
  doneLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    // A file or a signature is never carried forward: it is given afresh.
    const start: Record<string, unknown> = {};
    for (const f of fields) {
      const v = initialValues?.[f.id];
      if (v !== undefined && f.type !== "file" && f.type !== "signature") start[f.id] = v;
    }
    return start;
  });
  const [signedName, setSignedName] = useState("");
  const [signer, setSigner] = useState<{ role: SignerRole; name: string; relationship: string; image: string | null }>({
    role: "client",
    name: "",
    relationship: "",
    image: null,
  });
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    record ? submitFormRecordAction : submitFormResponseAction,
    {},
  );

  const visible = fields.filter((f) => isFieldVisible(f, values));
  const set = (id: string, v: unknown) => setValues((prev) => ({ ...prev, [id]: v }));
  const missing = new Set(state.missing ?? []);

  if (state.ok) {
    return (
      <Card>
        <CardContent className="space-y-2 py-8 text-center text-sm">
          <p>{doneMessage}</p>
          {state.href && (
            <p>
              <Link href={state.href} className="text-primary hover:underline">
                Read it back, or download the PDF
              </Link>
            </p>
          )}
          {doneHref && (
            <Link href={doneHref} className="text-primary hover:underline">
              ← {doneLabel}
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {assignmentId && <input type="hidden" name="assignmentId" value={assignmentId} />}
      {record && <input type="hidden" name="templateId" value={record.templateId} />}
      {record?.clientId && <input type="hidden" name="clientId" value={record.clientId} />}
      {record?.reviewOf && <input type="hidden" name="reviewOf" value={record.reviewOf} />}
      <input type="hidden" name="answers" value={JSON.stringify(values)} />
      {record?.deviceSigning && (
        <input
          type="hidden"
          name="signatures"
          value={JSON.stringify(signer.name.trim() ? [{ role: signer.role, name: signer.name, relationship: signer.relationship, image: signer.image }] : [])}
        />
      )}

      {visible.map((f) => {
        if (f.type === "heading") {
          return (
            <div key={f.id} className="space-y-1 pt-4 first:pt-0">
              <h3 className="text-base font-semibold">{f.label}</h3>
              {f.hint && <p className="text-sm text-muted-foreground">{f.hint}</p>}
            </div>
          );
        }
        const flagged = missing.has(f.label);
        const label = (
          <Label htmlFor={`q-${f.id}`} className={flagged ? "text-rose-600" : undefined}>
            {f.label}
            {f.required && <span aria-hidden> *</span>}
          </Label>
        );
        return (
          <Card key={f.id}>
            <CardContent className="space-y-2 pt-6">
              {label}
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              {f.type === "text" && (
                <Input id={`q-${f.id}`} value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
              )}
              {f.type === "number" && (
                <Input id={`q-${f.id}`} type="number" value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
              )}
              {f.type === "date" && (
                <Input id={`q-${f.id}`} type="date" value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
              )}
              {f.type === "textarea" && (
                <textarea id={`q-${f.id}`} rows={4} className={textareaClass} value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)} />
              )}
              {f.type === "select" && (
                <select id={`q-${f.id}`} className={inputClass} value={String(values[f.id] ?? "")} onChange={(e) => set(f.id, e.target.value)}>
                  <option value="">Choose…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              )}
              {f.type === "radio" && (
                <div className="space-y-1">
                  {f.options.map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm">
                      <input type="radio" name={`q-${f.id}`} value={o} checked={values[f.id] === o} onChange={() => set(f.id, o)} />
                      {o}
                    </label>
                  ))}
                </div>
              )}
              {f.type === "checkbox" && (
                <div className="space-y-1">
                  {f.options.map((o) => {
                    const current = Array.isArray(values[f.id]) ? (values[f.id] as string[]) : [];
                    return (
                      <label key={o} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={current.includes(o)}
                          onChange={(e) => set(f.id, e.target.checked ? [...current, o] : current.filter((x) => x !== o))}
                        />
                        {o}
                      </label>
                    );
                  })}
                </div>
              )}
              {f.type === "file" && (
                <div className="space-y-1">
                  {/* Sent with the form itself; the server stores it and keeps the path as the answer. */}
                  <Input
                    id={`q-${f.id}`}
                    type="file"
                    name={`file_${f.id}`}
                    accept="image/*,application/pdf"
                    onChange={(e) => set(f.id, e.target.files?.[0] ? { pending: e.target.files[0].name } : undefined)}
                  />
                  <p className="text-xs text-muted-foreground">A photo or PDF, under 3 MB.</p>
                </div>
              )}
              {f.type === "signature" && (
                <div className="space-y-1">
                  <Input
                    id={`q-${f.id}`}
                    name="signedName"
                    placeholder="Type your full name"
                    value={signedName}
                    onChange={(e) => {
                      setSignedName(e.target.value);
                      set(f.id, e.target.value);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Typing your name here is your signature, recorded with the date and time.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {record && record.reviewDue !== undefined && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <Label htmlFor="review-due">Review by</Label>
            <Input id="review-due" type="date" name="reviewDue" defaultValue={record.reviewDue ?? ""} className="max-w-48" />
            <p className="text-xs text-muted-foreground">
              It shows in Who&apos;s due when this date comes round. Change it if this one needs looking at sooner.
            </p>
          </CardContent>
        </Card>
      )}

      {record?.deviceSigning && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div>
              <p className="text-sm font-medium">Signed by the client or their family</p>
              <p className="text-xs text-muted-foreground">
                Optional. Hand them the device to read the answers and sign with a finger; leave it blank if they are not here.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="signer-role">Who is signing</Label>
                <select
                  id="signer-role"
                  className={inputClass}
                  value={signer.role}
                  onChange={(e) => setSigner((s) => ({ ...s, role: e.target.value as SignerRole }))}
                >
                  {SIGNER_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="signer-name">Their name</Label>
                <Input id="signer-name" value={signer.name} onChange={(e) => setSigner((s) => ({ ...s, name: e.target.value }))} />
              </div>
              {signer.role !== "client" && (
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="signer-relationship">Relationship to the client</Label>
                  <Input
                    id="signer-relationship"
                    placeholder="Daughter, lasting power of attorney…"
                    value={signer.relationship}
                    onChange={(e) => setSigner((s) => ({ ...s, relationship: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <SignaturePad onChange={(image) => setSigner((s) => ({ ...s, image }))} />
          </CardContent>
        </Card>
      )}

      {state.error && (
        <p className="text-sm text-rose-600">
          {state.error}
          {state.missing?.length ? ` Still needed: ${state.missing.join(", ")}.` : ""}
        </p>
      )}
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Submit"}</Button>
    </form>
  );
}

/**
 * Supervisions and appraisals — the employer's record of a conversation.
 *
 * Deliberately plain, because this is the template for the record types after
 * it: a dated record, held by somebody, about somebody, with a summary and a
 * next-due date. What was agreed does not live in the summary text — it goes
 * to record_actions, where it joins everything else outstanding for that carer
 * and can actually be chased.
 *
 * The dated-record half it shares with spot checks — next due, and what was
 * agreed — lives in lib/records.ts. Pure except for the loader.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPERVISION_KINDS = [
  { value: "supervision", label: "Supervision" },
  { value: "appraisal", label: "Appraisal" },
  { value: "probation", label: "Probation review" },
  { value: "return_to_work", label: "Return to work" },
] as const;

export type SupervisionKind = (typeof SUPERVISION_KINDS)[number]["value"];

export function kindLabel(value: string): string {
  return SUPERVISION_KINDS.find((k) => k.value === value)?.label ?? value;
}

export interface Supervision {
  id: string;
  kind: string;
  held_on: string;
  summary: string | null;
  next_due: string | null;
  supervisor_name: string | null;
  carer_signature: string | null;
  carer_signed_name: string | null;
  carer_signed_at: string | null;
  carer_unsigned_reason: string | null;
}

/** A drawn signature is a PNG data URL; this is generous for a 400×140 pad. */
const SIGNATURE_MAX = 200_000;

/**
 * What a new supervision records about the carer's signature (CARER-FILE.md
 * §9): their drawn signature and typed name, or the reason they could not
 * sign at the time. One or the other, never neither. Pure, so the rule is
 * tested rather than trusted to the form.
 */
export function carerSignature(input: {
  signature: string;
  name: string;
  unsignedReason: string;
  now: Date;
}):
  | { ok: true; fields: { carer_signature: string | null; carer_signed_name: string | null; carer_signed_at: string | null; carer_unsigned_reason: string | null } }
  | { ok: false; error: string } {
  const reason = input.unsignedReason.trim();
  if (reason) {
    return {
      ok: true,
      fields: { carer_signature: null, carer_signed_name: null, carer_signed_at: null, carer_unsigned_reason: reason.slice(0, 500) },
    };
  }
  const name = input.name.trim();
  if (!input.signature) return { ok: false, error: "Ask them to sign, or say why they cannot sign now." };
  if (!input.signature.startsWith("data:image/png;base64,") || input.signature.length > SIGNATURE_MAX) {
    return { ok: false, error: "The signature could not be read. Clear it and sign again." };
  }
  if (!name) return { ok: false, error: "Ask them to type their name beside their signature." };
  return {
    ok: true,
    fields: {
      carer_signature: input.signature,
      carer_signed_name: name.slice(0, 200),
      carer_signed_at: input.now.toISOString(),
      carer_unsigned_reason: null,
    },
  };
}

/** The next-due date that matters: the latest record's, since it supersedes. */
export function nextDueOf(supervisions: Supervision[]): string | null {
  return supervisions[0]?.next_due ?? null;
}

export async function loadSupervisions(
  supabase: SupabaseClient,
  userId: string,
): Promise<Supervision[]> {
  const { data } = await supabase
    .from("supervisions")
    .select("id, kind, held_on, summary, next_due, carer_signature, carer_signed_name, carer_signed_at, carer_unsigned_reason, supervisor:users!supervisions_supervisor_id_fkey (full_name, email)")
    .eq("user_id", userId)
    .order("held_on", { ascending: false })
    .limit(100);

  return (data ?? []).map((row) => {
    // PostgREST gives an embedded row as an object, or an array when it cannot
    // prove the relationship is to-one.
    const raw = (row as { supervisor?: unknown }).supervisor;
    const supervisor = (Array.isArray(raw) ? raw[0] : raw) as
      | { full_name?: string | null; email?: string | null }
      | undefined;
    return {
      id: row.id as string,
      kind: row.kind as string,
      held_on: row.held_on as string,
      summary: (row.summary as string | null) ?? null,
      next_due: (row.next_due as string | null) ?? null,
      supervisor_name: supervisor?.full_name ?? supervisor?.email ?? null,
      carer_signature: (row.carer_signature as string | null) ?? null,
      carer_signed_name: (row.carer_signed_name as string | null) ?? null,
      carer_signed_at: (row.carer_signed_at as string | null) ?? null,
      carer_unsigned_reason: (row.carer_unsigned_reason as string | null) ?? null,
    };
  });
}

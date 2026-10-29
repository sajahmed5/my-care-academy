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
import type { ActionReview, AuditQuestion, TextAnswer } from "./audit-forms";

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
  /** The form's questions as asked, with the answers (STAFF-AUDITS.md). */
  answers: TextAnswer[];
  /** Last time's actions, as reviewed at the start of this one. */
  actions_review: ActionReview[];
  manager_signature: string | null;
  manager_signed_name: string | null;
  manager_signed_at: string | null;
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

/**
 * The manager's signature: both people sign a supervision (STAFF-AUDITS.md).
 * No "cannot sign" for the manager — they are the one holding the pen.
 */
export function managerSignature(input: { signature: string; name: string; now: Date }):
  | { ok: true; fields: { manager_signature: string; manager_signed_name: string; manager_signed_at: string } }
  | { ok: false; error: string } {
  const name = input.name.trim();
  if (!input.signature) return { ok: false, error: "Sign it yourself as well." };
  if (!input.signature.startsWith("data:image/png;base64,") || input.signature.length > SIGNATURE_MAX) {
    return { ok: false, error: "Your signature could not be read. Clear it and sign again." };
  }
  if (!name) return { ok: false, error: "Type your name beside your signature." };
  return {
    ok: true,
    fields: { manager_signature: input.signature, manager_signed_name: name.slice(0, 200), manager_signed_at: input.now.toISOString() },
  };
}

/**
 * The next-due date that matters: the latest record's, since it supersedes.
 * Supervisions and appraisals fall due on their own, so ask for one kind.
 */
export function nextDueOf(supervisions: Supervision[], kind?: string): string | null {
  const list = kind ? supervisions.filter((s) => s.kind === kind) : supervisions;
  return list[0]?.next_due ?? null;
}

export async function loadSupervisions(
  supabase: SupabaseClient,
  userId: string,
): Promise<Supervision[]> {
  const { data } = await supabase
    .from("supervisions")
    .select("id, kind, held_on, summary, next_due, carer_signature, carer_signed_name, carer_signed_at, carer_unsigned_reason, answers, actions_review, manager_signature, manager_signed_name, manager_signed_at, supervisor:users!supervisions_supervisor_id_fkey (full_name, email)")
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
      answers: Array.isArray(row.answers) ? (row.answers as TextAnswer[]) : [],
      actions_review: Array.isArray(row.actions_review) ? (row.actions_review as ActionReview[]) : [],
      manager_signature: (row.manager_signature as string | null) ?? null,
      manager_signed_name: (row.manager_signed_name as string | null) ?? null,
      manager_signed_at: (row.manager_signed_at as string | null) ?? null,
    };
  });
}

// ---------------------------------------------------------------- bookings

export interface Booking {
  id: string;
  user_id: string;
  kind: string;
  booked_on: string;
  booked_time: string | null;
  location: string | null;
  note: string | null;
  status: string;
  with_name: string | null;
  with_user_id: string | null;
}

const BOOKING_SELECT =
  "id, user_id, kind, booked_on, booked_time, location, note, status, with_user_id, with:users!staff_audit_bookings_with_user_id_fkey (full_name, email)";

function shapeBooking(row: Record<string, unknown>): Booking {
  const raw = row.with;
  const w = (Array.isArray(raw) ? raw[0] : raw) as { full_name?: string | null; email?: string | null } | undefined;
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    kind: row.kind as string,
    booked_on: row.booked_on as string,
    booked_time: (row.booked_time as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    status: row.status as string,
    with_user_id: (row.with_user_id as string | null) ?? null,
    with_name: w?.full_name ?? w?.email ?? null,
  };
}

/**
 * Booked supervisions and appraisals still to happen, soonest first. The same
 * read serves the manager (console RLS) and the person themselves (own-read
 * RLS), which is why it filters on user_id rather than trusting the policy.
 */
export async function loadBookings(supabase: SupabaseClient, userId: string): Promise<Booking[]> {
  const { data } = await supabase
    .from("staff_audit_bookings")
    .select(BOOKING_SELECT)
    .eq("user_id", userId)
    .eq("status", "booked")
    .order("booked_on")
    .limit(20);
  return (data ?? []).map((r) => shapeBooking(r as Record<string, unknown>));
}

export async function loadBooking(supabase: SupabaseClient, id: string): Promise<Booking | null> {
  const { data } = await supabase.from("staff_audit_bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle();
  return data ? shapeBooking(data as Record<string, unknown>) : null;
}

export interface SelfAssessment {
  id: string;
  booking_id: string;
  questions: AuditQuestion[];
  answers: Record<string, string>;
  submitted_at: string | null;
}

export function shapeSelfAssessment(row: Record<string, unknown>): SelfAssessment {
  return {
    id: row.id as string,
    booking_id: row.booking_id as string,
    questions: Array.isArray(row.questions) ? (row.questions as AuditQuestion[]) : [],
    answers: row.answers && typeof row.answers === "object" ? (row.answers as Record<string, string>) : {},
    submitted_at: (row.submitted_at as string | null) ?? null,
  };
}

/** "Tuesday 12 November 2026 at 10:00". */
export function bookingWhen(b: { booked_on: string; booked_time: string | null }, fmt: (d: string) => string): string {
  return b.booked_time ? `${fmt(b.booked_on)} at ${b.booked_time}` : fmt(b.booked_on);
}

/**
 * Reading performance plans. RLS does the scoping.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readConcerns, readExpectations, readSupport, type Pip } from "./plan";

const nameOf = (raw: unknown): string | null => {
  const p = (Array.isArray(raw) ? raw[0] : raw) as { full_name?: string | null; email?: string | null } | undefined;
  return p?.full_name ?? p?.email ?? null;
};

const SELECT = `
  *,
  carer:users!pips_user_id_fkey (full_name, email),
  owner:users!pips_owner_id_fkey (full_name, email),
  signer:users!pips_manager_signed_by_fkey (full_name, email),
  complaint:complaints!pips_complaint_id_fkey (reference),
  pip_reviews (id, week_number, period_start, period_end, manager_notes, carer_response, rating, actions_next, completed_at),
  pip_training (id, review_id, session_date, topic, trainer_name, attended, assessment_result, notes)
`;

function shape(r: Record<string, unknown>): Pip {
  const complaint = (Array.isArray(r.complaint) ? r.complaint[0] : r.complaint) as { reference?: string } | null | undefined;
  const reviews = ((r.pip_reviews as Record<string, unknown>[] | null) ?? [])
    .map((w) => ({
      id: w.id as string,
      weekNumber: w.week_number as number,
      periodStart: w.period_start as string,
      periodEnd: w.period_end as string,
      managerNotes: (w.manager_notes as string | null) ?? null,
      carerResponse: (w.carer_response as string | null) ?? null,
      rating: (w.rating as string | null) ?? null,
      actionsNext: (w.actions_next as string | null) ?? null,
      completedAt: (w.completed_at as string | null) ?? null,
    }))
    .sort((a, b) => a.weekNumber - b.weekNumber);
  const training = ((r.pip_training as Record<string, unknown>[] | null) ?? [])
    .map((t) => ({
      id: t.id as string,
      reviewId: (t.review_id as string | null) ?? null,
      sessionDate: t.session_date as string,
      topic: t.topic as string,
      trainerName: (t.trainer_name as string | null) ?? null,
      attended: (t.attended as boolean | null) ?? null,
      assessmentResult: (t.assessment_result as string | null) ?? null,
      notes: (t.notes as string | null) ?? null,
    }))
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  return {
    id: r.id as string,
    userId: r.user_id as string,
    carerName: nameOf(r.carer) ?? "Unknown",
    kind: r.kind as string,
    status: r.status as string,
    complaintId: (r.complaint_id as string | null) ?? null,
    complaintReference: complaint?.reference ?? null,
    reason: (r.reason as string | null) ?? null,
    concerns: readConcerns(r.concerns),
    expectations: readExpectations(r.expectations),
    support: readSupport(r.support),
    consequences: (r.consequences as string | null) ?? null,
    durationWeeks: (r.duration_weeks as number | null) ?? null,
    startDate: (r.start_date as string | null) ?? null,
    reviewUntil: (r.review_until as string | null) ?? null,
    reviewFrequency: (r.review_frequency as string | null) ?? null,
    ownerName: nameOf(r.owner),
    outcome: (r.outcome as string | null) ?? null,
    outcomeNotes: (r.outcome_notes as string | null) ?? null,
    outcomeNextStep: (r.outcome_next_step as string | null) ?? null,
    completionSummary: (r.completion_summary as string | null) ?? null,
    carerSignature: (r.carer_signature as string | null) ?? null,
    carerSignedAt: (r.carer_signed_at as string | null) ?? null,
    carerSignedWitnessedBy: (r.carer_signed_witnessed_by as string | null) ?? null,
    managerSignature: (r.manager_signature as string | null) ?? null,
    managerSignedAt: (r.manager_signed_at as string | null) ?? null,
    managerSignedByName: nameOf(r.signer),
    closedAt: (r.closed_at as string | null) ?? null,
    createdAt: r.created_at as string,
    reviews,
    training,
  };
}

/** Every plan in the organisation, open first, newest first. */
export async function loadPips(supabase: SupabaseClient): Promise<Pip[]> {
  const { data } = await supabase
    .from("pips")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((r) => shape(r as Record<string, unknown>));
}

export async function loadPip(supabase: SupabaseClient, id: string): Promise<Pip | null> {
  const { data } = await supabase.from("pips").select(SELECT).eq("id", id).maybeSingle();
  return data ? shape(data as Record<string, unknown>) : null;
}

/** Plans naming one person, for the carer file. */
export async function loadPipsForPerson(supabase: SupabaseClient, userId: string): Promise<Pip[]> {
  const { data } = await supabase
    .from("pips")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => shape(r as Record<string, unknown>));
}

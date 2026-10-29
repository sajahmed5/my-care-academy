"use server";

import { STAFF_ROLES } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import type { SaveState } from "@/app/platform/actions";
import {
  PIP_FREQUENCIES,
  PIP_KINDS,
  PIP_OUTCOMES,
  PIP_WEEK_RATINGS,
  readConcerns,
  readExpectations,
  readSupport,
  weeksFor,
} from "@/lib/pips/plan";

/**
 * Performance plans. Written through the RLS-scoped client, gated on
 * complaints.register like the record they usually come from.
 */

const NOT_IN_PLAN = "Performance plans are not included in your plan.";
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const json = (fd: FormData, key: string): unknown => {
  try {
    return JSON.parse(str(fd, key) || "null");
  } catch {
    return null;
  }
};

async function requirePips() {
  const context = await requireConsole();
  if (!(await hasFeature(context, "complaints.register"))) return null;
  return context;
}

function revalidate(pipId: string, userId?: string | null, complaintId?: string | null) {
  revalidatePath("/org/pips");
  revalidatePath(`/org/pips/${pipId}`);
  if (userId) revalidatePath(`/org/staff/${userId}`);
  if (complaintId) revalidatePath(`/org/complaints/${complaintId}`);
}

/** Create a plan, or change the plan part of one (not its reviews or outcome). */
export async function savePlanAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requirePips();
  if (!context) return { ok: false, error: NOT_IN_PLAN };

  const pipId = str(formData, "pipId");
  const userId = str(formData, "userId");
  const kind = str(formData, "kind") || "pip";
  const complaintId = str(formData, "complaintId");
  const reason = str(formData, "reason");
  const concerns = readConcerns(json(formData, "concerns"));
  const expectations = readExpectations(json(formData, "expectations"));
  const support = readSupport(json(formData, "support"));
  const consequences = str(formData, "consequences");
  const durationWeeks = parseInt(str(formData, "durationWeeks") || "0", 10);
  const startDate = str(formData, "startDate");
  const frequency = str(formData, "reviewFrequency") || "weekly";

  if (!pipId && !userId) return { ok: false, error: "Pick who the plan is for." };
  if (!PIP_KINDS.some((k) => k.value === kind)) return { ok: false, error: "Pick what kind of plan this is." };
  if (!reason) return { ok: false, error: "Say why the plan is being raised." };
  if (concerns.length === 0) return { ok: false, error: "List at least one concern — what is wrong, what good looks like, how it is measured." };
  if (concerns.some((c) => !c.standard || !c.measure)) {
    return { ok: false, error: "Every concern needs the standard expected and how it will be measured. Without the measure a review is a matter of opinion." };
  }
  if (support.length === 0) return { ok: false, error: "Record the support being offered. A plan that offers none is not defensible." };
  if (!PIP_FREQUENCIES.some((f) => f.value === frequency)) return { ok: false, error: "Pick how often it is reviewed." };
  if (!pipId) {
    if (!(durationWeeks >= 1 && durationWeeks <= 12)) return { ok: false, error: "A plan runs for between 1 and 12 weeks." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: "Say when it starts." };
  }

  const supabase = await createClient();
  const plan = {
    kind,
    reason,
    concerns,
    expectations,
    support,
    consequences: consequences || null,
    review_frequency: frequency,
  };

  if (pipId) {
    // The update hands back the two ids revalidate needs, rather than a second
    // read of the whole plan — signatures, weeks and all — to find them.
    const { data: existing, error } = await supabase
      .from("pips")
      .update(plan)
      .eq("id", pipId)
      .select("user_id, complaint_id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    revalidate(pipId, existing?.user_id as string | undefined, existing?.complaint_id as string | null | undefined);
    return { ok: true };
  }

  // The carer must be one of theirs and a learner: a form field is not a permission check.
  const { data: target } = await supabase.from("users").select("id").eq("id", userId).in("role", STAFF_ROLES).maybeSingle();
  if (!target) return { ok: false, error: "That person is not a member of staff in your organisation." };

  const weeks = weeksFor(startDate, durationWeeks);
  const { data: row, error } = await supabase
    .from("pips")
    .insert({
      ...plan,
      organisation_id: context.organisationId,
      user_id: userId,
      complaint_id: complaintId || null,
      duration_weeks: durationWeeks,
      start_date: startDate,
      review_until: weeks.at(-1)?.periodEnd ?? null,
      owner_id: context.userId,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const id = row.id as string;

  // The weeks are fixed now, so every review is against a period set before it began.
  const { error: wErr } = await supabase
    .from("pip_reviews")
    .insert(weeks.map((w) => ({ pip_id: id, week_number: w.weekNumber, period_start: w.periodStart, period_end: w.periodEnd })));
  if (wErr) return { ok: false, error: `The plan was created but its weeks were not: ${wErr.message}` };

  await logAudit({ context, action: "pip.created", entity: "pip", entityId: id, detail: { userId, kind, complaintId: complaintId || null } });
  revalidate(id, userId, complaintId || null);
  redirect(`/org/pips/${id}`);
}

/** The carer signs, in the office, with the manager present. */
export async function signCarerAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requirePips();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const pipId = str(formData, "pipId");
  const signature = str(formData, "signature");
  const witnessedBy = str(formData, "witnessedBy") || context.email || null;
  if (!signature.startsWith("data:image/png;base64,") || signature.length > 400_000) {
    return { ok: false, error: "Sign in the box first." };
  }
  const supabase = await createClient();
  const { data: pip, error } = await supabase
    .from("pips")
    .update({ carer_signature: signature, carer_signed_at: new Date().toISOString(), carer_signed_witnessed_by: witnessedBy })
    .eq("id", pipId)
    .select("user_id, complaint_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "pip.carer_signed", entity: "pip", entityId: pipId });
  revalidate(pipId, pip?.user_id as string | undefined, pip?.complaint_id as string | null | undefined);
  return { ok: true };
}

export async function signManagerAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requirePips();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const pipId = str(formData, "pipId");
  const signature = str(formData, "signature");
  if (!signature.startsWith("data:image/png;base64,") || signature.length > 400_000) {
    return { ok: false, error: "Sign in the box first." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("pips")
    .update({ manager_signature: signature, manager_signed_at: new Date().toISOString(), manager_signed_by: context.userId })
    .eq("id", pipId);
  if (error) return { ok: false, error: error.message };
  revalidate(pipId);
  return { ok: true };
}

/** One week's review: the manager's judgement and the carer's reply. */
export async function saveReviewAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requirePips();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const pipId = str(formData, "pipId");
  const reviewId = str(formData, "reviewId");
  const managerNotes = str(formData, "managerNotes");
  const carerResponse = str(formData, "carerResponse");
  const rating = str(formData, "rating");
  const actionsNext = str(formData, "actionsNext");
  const complete = formData.get("complete") === "1";
  if (rating && !PIP_WEEK_RATINGS.some((r) => r.value === rating)) return { ok: false, error: "Pick how the week went." };
  if (complete && (!rating || !managerNotes)) {
    return { ok: false, error: "To sign the week off, say how it went and what you saw." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("pip_reviews")
    .update({
      manager_notes: managerNotes || null,
      carer_response: carerResponse || null,
      carer_responded_at: carerResponse ? new Date().toISOString() : null,
      rating: rating || null,
      actions_next: actionsNext || null,
      ...(complete ? { completed_at: new Date().toISOString(), completed_by: context.userId } : {}),
    })
    .eq("id", reviewId)
    .eq("pip_id", pipId);
  if (error) return { ok: false, error: error.message };
  revalidate(pipId);
  return { ok: true };
}

/** Extend the plan by one week, after the last. */
export async function addWeekAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requirePips();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const pipId = str(formData, "pipId");
  const supabase = await createClient();
  // Only the last week is needed to place the next one.
  const [{ data: pip }, { data: lastRows }] = await Promise.all([
    supabase.from("pips").select("status, start_date, duration_weeks").eq("id", pipId).maybeSingle(),
    supabase
      .from("pip_reviews")
      .select("week_number, period_end")
      .eq("pip_id", pipId)
      .order("week_number", { ascending: false })
      .limit(1),
  ]);
  if (!pip) return { ok: false, error: "That plan is no longer there." };
  if (pip.status !== "open") return { ok: false, error: "The plan is not open." };
  const lastRow = lastRows?.[0];
  const last = lastRow ? { weekNumber: lastRow.week_number as number, periodEnd: lastRow.period_end as string } : undefined;
  const startDate = (pip.start_date as string | null) ?? null;
  const start = last ? new Date(`${last.periodEnd}T12:00:00Z`) : new Date(`${startDate ?? new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  if (last) start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = end.toISOString().slice(0, 10);
  const { error } = await supabase.from("pip_reviews").insert({
    pip_id: pipId,
    week_number: (last?.weekNumber ?? 0) + 1,
    period_start: periodStart,
    period_end: periodEnd,
  });
  if (error) return { ok: false, error: error.message };
  await supabase.from("pips").update({ review_until: periodEnd, duration_weeks: Math.min(12, ((pip.duration_weeks as number | null) ?? 0) + 1) }).eq("id", pipId);
  revalidate(pipId);
  return { ok: true };
}

export async function addTrainingAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requirePips();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const pipId = str(formData, "pipId");
  const sessionDate = str(formData, "sessionDate");
  const topic = str(formData, "topic");
  const trainerName = str(formData, "trainerName");
  const attended = str(formData, "attended");
  const assessmentResult = str(formData, "assessmentResult");
  const notes = str(formData, "notes");
  const reviewId = str(formData, "reviewId");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return { ok: false, error: "Say when the session is." };
  if (!topic) return { ok: false, error: "Say what the session covers." };
  const supabase = await createClient();
  const { error } = await supabase.from("pip_training").insert({
    pip_id: pipId,
    review_id: reviewId || null,
    session_date: sessionDate,
    topic,
    trainer_name: trainerName || null,
    attended: attended === "yes" ? true : attended === "no" ? false : null,
    assessment_result: assessmentResult || null,
    notes: notes || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidate(pipId);
  return { ok: true };
}

export async function deleteTrainingAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requirePips();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const pipId = str(formData, "pipId");
  const id = str(formData, "trainingId");
  const supabase = await createClient();
  const { error } = await supabase.from("pip_training").delete().eq("id", id).eq("pip_id", pipId);
  if (error) return { ok: false, error: error.message };
  revalidate(pipId);
  return { ok: true };
}

/**
 * Close the plan with its outcome. Refused while a week is unreviewed: an
 * outcome reached before the evidence is in is the thing a tribunal asks about.
 */
export async function closePipAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requirePips();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const pipId = str(formData, "pipId");
  const outcome = str(formData, "outcome");
  const outcomeNotes = str(formData, "outcomeNotes");
  const nextStep = str(formData, "outcomeNextStep");
  const summary = str(formData, "completionSummary");
  if (!PIP_OUTCOMES.some((o) => o.value === outcome)) return { ok: false, error: "Pick the outcome." };
  if (!outcomeNotes) return { ok: false, error: "Say why that is the outcome." };

  const supabase = await createClient();
  // What the gate checks: the signature, and which weeks are not signed off.
  const { data: pip } = await supabase
    .from("pips")
    .select("user_id, complaint_id, carer_signed_at, pip_reviews (week_number, completed_at)")
    .eq("id", pipId)
    .maybeSingle();
  if (!pip) return { ok: false, error: "That plan is no longer there." };
  const unreviewed = ((pip.pip_reviews as { week_number: number; completed_at: string | null }[] | null) ?? [])
    .filter((r) => !r.completed_at)
    .map((r) => r.week_number)
    .sort((a, b) => a - b);
  if (unreviewed.length) {
    return { ok: false, error: `Week${unreviewed.length === 1 ? "" : "s"} ${unreviewed.join(", ")} ${unreviewed.length === 1 ? "has" : "have"} not been reviewed. Review every week, then close.` };
  }
  if (!pip.carer_signed_at) {
    return { ok: false, error: "The carer has not signed the plan. Get their signature first — a plan they never saw cannot be closed against them." };
  }
  const { error } = await supabase
    .from("pips")
    .update({
      status: "completed",
      outcome,
      outcome_notes: outcomeNotes,
      outcome_next_step: nextStep || null,
      completion_summary: summary || null,
      closed_at: new Date().toISOString(),
    })
    .eq("id", pipId);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "pip.closed", entity: "pip", entityId: pipId, detail: { outcome } });
  revalidate(pipId, pip.user_id as string, pip.complaint_id as string | null);
  return { ok: true };
}

export async function cancelPipAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requirePips();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const pipId = str(formData, "pipId");
  const reopen = formData.get("reopen") === "1";
  const supabase = await createClient();
  const { data: pip, error } = await supabase
    .from("pips")
    .update(reopen ? { status: "open", closed_at: null } : { status: "cancelled", closed_at: new Date().toISOString() })
    .eq("id", pipId)
    .select("user_id, complaint_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  revalidate(pipId, pip?.user_id as string | undefined, pip?.complaint_id as string | null | undefined);
  return { ok: true };
}

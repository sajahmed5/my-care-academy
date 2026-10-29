"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireConsole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import { siteOrigin } from "@/lib/site-url";
import { parseAgreedActions } from "@/lib/records";
import { isAuditKind, readActionsReview, readTextAnswers } from "@/lib/audit-forms";
import { loadAuditForms } from "@/lib/audit-forms-data";
import { carerSignature, managerSignature } from "@/lib/supervisions";
import { emailBooking } from "@/lib/staff-audit-email";
import type { SaveState } from "@/app/platform/actions";

/**
 * Booking and recording supervisions and appraisals (STAFF-AUDITS.md).
 *
 * Written through the RLS-scoped client: the policies — console user, own
 * organisation, people.supervisions — are the gate. The feature is checked
 * here too so a manager reads "not included in your plan" rather than a
 * row-level security error, and the person is checked to be one of theirs
 * because a form field is not a permission check.
 */

const NOT_IN_PLAN = "Supervisions are not included in your plan.";
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function gate() {
  const context = await requireConsole();
  if (!(await hasFeature(context, "people.supervisions"))) return null;
  return context;
}

/** One of theirs, and staff: carers and office staff both have supervisions. */
async function personInOrg(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .in("role", STAFF_ROLES)
    .maybeSingle();
  return !!data;
}

export interface BookState extends SaveState {
  emailed?: boolean;
}

/**
 * Book a supervision or an appraisal. The person is emailed the date and who
 * with; an appraisal also opens their self-assessment, with the questions as
 * the form has them today.
 */
export async function bookAuditAction(_prev: BookState, formData: FormData): Promise<BookState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };

  const userId = str(formData, "userId");
  const kind = str(formData, "kind");
  const bookedOn = str(formData, "bookedOn");
  const bookedTime = str(formData, "bookedTime").slice(0, 40);
  const withUserId = str(formData, "withUserId") || context.userId;
  const location = str(formData, "location").slice(0, 200);
  const note = str(formData, "note").slice(0, 1000);

  if (!isAuditKind(kind)) return { ok: false, error: "Pick a supervision or an appraisal." };
  if (!ISO_DATE.test(bookedOn)) return { ok: false, error: "Say which day." };

  const supabase = await createClient();
  if (!(await personInOrg(supabase, userId))) return { ok: false, error: "That person is not in your organisation." };
  // Who holds it needs console access: a senior carer holding supervisions
  // needs an office login (STAFF-AUDITS.md).
  const { data: holder } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("id", withUserId)
    .in("role", ["org_admin", "org_office"])
    .maybeSingle();
  if (!holder) return { ok: false, error: "Pick who is holding it — a manager or office login." };

  const { data: booking, error } = await supabase
    .from("staff_audit_bookings")
    .insert({
      organisation_id: context.organisationId,
      user_id: userId,
      kind,
      booked_on: bookedOn,
      booked_time: bookedTime || null,
      with_user_id: withUserId,
      location: location || null,
      note: note || null,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // The company's questions as they are today, kept with the booking.
  const selfQuestions = (await loadAuditForms(context.organisationId!))[kind].selfAssessment;
  if (selfQuestions.length) {
    const { error: saError } = await supabase.from("appraisal_self_assessments").insert({
      organisation_id: context.organisationId,
      user_id: userId,
      booking_id: booking.id,
      questions: selfQuestions,
    });
    if (saError) return { ok: false, error: `Booked, but their self-assessment did not open: ${saError.message}` };
  }

  const origin = await siteOrigin();
  const organisationId = context.organisationId!;
  after(() =>
    emailBooking(
      createAdminClient(),
      {
        userId,
        kind,
        bookedOn,
        bookedTime: bookedTime || null,
        withName: (holder.full_name as string | null) || (holder.email as string),
        location: location || null,
        note: note || null,
        selfAssessment: selfQuestions.length > 0,
      },
      { organisationId, bookedBy: context.userId, origin },
    ).then(() => undefined),
  );

  await logAudit({
    context,
    action: `${kind}.booked`,
    entity: "user",
    entityId: userId,
    detail: { bookedOn, bookedTime: bookedTime || null, withUserId },
  });

  revalidatePath(`/org/staff/${userId}`);
  return { ok: true, emailed: true };
}

/** Call a booking off. Its self-assessment closes with it. */
export async function cancelBookingAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const bookingId = str(formData, "bookingId");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_audit_bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("status", "booked")
    .select("user_id, kind")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That booking is no longer there." };
  await logAudit({ context, action: `${data.kind}.booking_cancelled`, entity: "user", entityId: data.user_id as string, detail: { bookingId } });
  revalidatePath(`/org/staff/${data.user_id}`);
  return { ok: true };
}

export interface RecordState extends SaveState {
  id?: string;
  count?: number;
}

/**
 * Record a supervision or an appraisal, from its form.
 *
 * In order: the record (with the answers as asked, the review of last time's
 * actions, both signatures), then last time's actions ticked off where they
 * were done, then the new ones. PostgREST has no transaction across calls, so
 * the record goes first: a later step that fails leaves a record with fewer
 * actions — visible and recoverable — never actions with no record.
 */
export async function recordSupervisionAction(_prev: RecordState, formData: FormData): Promise<RecordState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };

  const userId = str(formData, "userId");
  const kind = str(formData, "kind");
  const heldOn = str(formData, "heldOn");
  const bookingId = str(formData, "bookingId");
  const summary = str(formData, "summary");
  const nextDue = str(formData, "nextDue");
  const agreed = parseAgreedActions(String(formData.get("agreed") ?? ""));
  const actionsDue = str(formData, "actionsDue");

  if (!isAuditKind(kind)) return { ok: false, error: "Pick a supervision or an appraisal." };
  if (!ISO_DATE.test(heldOn)) return { ok: false, error: "Say when it was held." };
  if (summary.length > 5000) return { ok: false, error: "Keep the summary under 5000 characters." };

  let raw: Record<string, string> = {};
  let rawReview: unknown = null;
  let offered: { id: string; title: string }[] = [];
  try {
    raw = JSON.parse(str(formData, "answers") || "{}");
    rawReview = JSON.parse(str(formData, "actionsReview") || "[]");
    offered = JSON.parse(str(formData, "offeredActions") || "[]");
  } catch {
    return { ok: false, error: "The form could not be read. Reload the page and try again." };
  }
  const answers = readTextAnswers((await loadAuditForms(context.organisationId!))[kind].questions, raw);
  if (!answers.ok) return { ok: false, error: answers.error };

  const now = new Date();
  if (formData.get("carerCannotSign") === "1" && !str(formData, "carerUnsignedReason")) {
    return { ok: false, error: "Say why they cannot sign now." };
  }
  const carer = carerSignature({
    signature: str(formData, "carerSignature"),
    name: str(formData, "carerSignedName"),
    unsignedReason: formData.get("carerCannotSign") === "1" ? str(formData, "carerUnsignedReason") : "",
    now,
  });
  if (!carer.ok) return { ok: false, error: carer.error };
  const manager = managerSignature({
    signature: str(formData, "managerSignature"),
    name: str(formData, "managerSignedName"),
    now,
  });
  if (!manager.ok) return { ok: false, error: manager.error };

  const supabase = await createClient();
  if (!(await personInOrg(supabase, userId))) return { ok: false, error: "That person is not in your organisation." };

  // Only their own open supervision actions can be reviewed: the ids came from
  // the browser, so they are checked against the table, not believed.
  const offeredIds = offered.map((a) => a.id).filter((id) => typeof id === "string").slice(0, 50);
  const { data: realActions } = offeredIds.length
    ? await supabase.from("record_actions").select("id, title").eq("user_id", userId).in("id", offeredIds)
    : { data: [] as { id: string; title: string }[] };
  const review = readActionsReview(
    (realActions ?? []).map((a) => ({ id: a.id as string, title: a.title as string })),
    rawReview,
  );

  const { data: row, error } = await supabase
    .from("supervisions")
    .insert({
      organisation_id: context.organisationId,
      user_id: userId,
      supervisor_id: context.userId,
      kind,
      held_on: heldOn,
      summary: summary || null,
      next_due: ISO_DATE.test(nextDue) ? nextDue : null,
      answers: answers.answers,
      actions_review: review,
      booking_id: bookingId || null,
      created_by: context.userId,
      ...carer.fields,
      ...manager.fields,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const done = review.filter((r) => r.status === "done").map((r) => r.id);
  if (done.length) {
    await supabase
      .from("record_actions")
      .update({ completed_at: now.toISOString(), completed_by: context.userId })
      .in("id", done)
      .is("completed_at", null);
  }

  if (bookingId) {
    await supabase.from("staff_audit_bookings").update({ status: "done", supervision_id: row.id }).eq("id", bookingId);
  }

  if (agreed.length) {
    const { error: actionError } = await supabase.from("record_actions").insert(
      agreed.map((title) => ({
        organisation_id: context.organisationId,
        user_id: userId,
        title,
        due_date: ISO_DATE.test(actionsDue) ? actionsDue : null,
        source_type: "supervision",
        source_id: row.id,
        created_by: context.userId,
      })),
    );
    if (actionError) {
      return { ok: false, id: row.id, error: `Saved the record, but the agreed actions did not save: ${actionError.message}` };
    }
  }

  await logAudit({
    context,
    action: "supervision.recorded",
    entity: "user",
    entityId: userId,
    detail: { kind, heldOn, actions: agreed.length, reviewed: review.length, signedByCarer: !!carer.fields.carer_signature },
  });

  revalidatePath(`/org/staff/${userId}`);
  return { ok: true, id: row.id, count: agreed.length };
}

"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import { siteOrigin } from "@/lib/site-url";
import { emailAssignees } from "@/lib/assignment-email";
import { parseAgreedActions } from "@/lib/records";
import { COMPETENCY_FORMS, SPOT_CHECK_FORM, competencyForm, readCheckAnswers } from "@/lib/audit-forms";
import { COMPETENCY_OUTCOMES } from "@/lib/competency";
import { carerSignature } from "@/lib/supervisions";
import type { SaveState } from "@/app/platform/actions";

/**
 * Spot checks and competency assessments (STAFF-AUDITS.md). Carers only:
 * both happen in clients' homes. Written through the RLS-scoped client, so
 * the console, own-organisation and people.competency policies are the gate.
 */

const NOT_IN_PLAN = "Spot checks and competency are not included in your plan.";
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOMES = COMPETENCY_OUTCOMES.map((o) => o.value as string);

async function gate() {
  const context = await requireConsole();
  if (!(await hasFeature(context, "people.competency"))) return null;
  return context;
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** A carer of theirs: spot checks and competency are not for office staff. */
async function carerInOrg(supabase: Client, userId: string) {
  const { data } = await supabase.from("users").select("id").eq("id", userId).eq("role", "learner").maybeSingle();
  return !!data;
}

function json(fd: FormData, key: string): unknown {
  try {
    return JSON.parse(str(fd, key) || "null");
  } catch {
    return null;
  }
}

async function addActions(
  supabase: Client,
  rows: { organisationId: string; userId: string; createdBy: string; sourceType: string; sourceId: string },
  agreed: string[],
  actionsDue: string,
) {
  if (!agreed.length) return null;
  const { error } = await supabase.from("record_actions").insert(
    agreed.map((title) => ({
      organisation_id: rows.organisationId,
      user_id: rows.userId,
      title,
      due_date: ISO_DATE.test(actionsDue) ? actionsDue : null,
      source_type: rows.sourceType,
      source_id: rows.sourceId,
      created_by: rows.createdBy,
    })),
  );
  return error?.message ?? null;
}

export interface CheckState extends SaveState {
  id?: string;
}

/**
 * Record a spot check. The client is picked from the client list and their
 * name kept as it was on the day; a company without the list can type it.
 */
export async function recordSpotCheckAction(_prev: CheckState, formData: FormData): Promise<CheckState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };

  const userId = str(formData, "userId");
  const clientId = str(formData, "clientId");
  const typedClient = str(formData, "clientName").slice(0, 200);
  const checkedOn = str(formData, "checkedOn");
  const outcome = str(formData, "outcome");
  const notes = str(formData, "notes");
  const nextDue = str(formData, "nextDue");
  const agreed = parseAgreedActions(String(formData.get("agreed") ?? ""));
  const actionsDue = str(formData, "actionsDue");

  if (!ISO_DATE.test(checkedOn)) return { ok: false, error: "Say when it was done." };
  if (!clientId && !typedClient) return { ok: false, error: "Pick the client whose home it was in." };
  const items = readCheckAnswers(SPOT_CHECK_FORM.items, json(formData, "items"));
  if (!items.ok) return { ok: false, error: items.error };
  if (!OUTCOMES.includes(outcome)) return { ok: false, error: "Pick the overall outcome." };
  if (notes.length > 5000) return { ok: false, error: "Keep the notes under 5000 characters." };
  if (formData.get("carerCannotSign") === "1" && !str(formData, "carerUnsignedReason")) {
    return { ok: false, error: "Say why they cannot sign now." };
  }
  const signed = carerSignature({
    signature: str(formData, "carerSignature"),
    name: str(formData, "carerSignedName"),
    unsignedReason: formData.get("carerCannotSign") === "1" ? str(formData, "carerUnsignedReason") : "",
    now: new Date(),
  });
  if (!signed.ok) return { ok: false, error: signed.error };

  const supabase = await createClient();
  if (!(await carerInOrg(supabase, userId))) return { ok: false, error: "Spot checks are for carers in your organisation." };

  let clientName = typedClient;
  if (clientId) {
    const { data: client } = await supabase.from("clients").select("full_name").eq("id", clientId).maybeSingle();
    if (!client) return { ok: false, error: "That client is not on your list." };
    clientName = client.full_name as string;
  }

  const { data: row, error } = await supabase
    .from("spot_checks")
    .insert({
      organisation_id: context.organisationId,
      user_id: userId,
      client_id: clientId || null,
      client_name: clientName,
      checked_on: checkedOn,
      items: items.answers,
      outcome,
      notes: notes || null,
      next_due: ISO_DATE.test(nextDue) ? nextDue : null,
      assessor_id: context.userId,
      created_by: context.userId,
      ...signed.fields,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const actionError = await addActions(
    supabase,
    { organisationId: context.organisationId!, userId, createdBy: context.userId, sourceType: "spot_check", sourceId: row.id },
    agreed,
    actionsDue,
  );
  if (actionError) return { ok: false, id: row.id, error: `Saved the spot check, but the actions did not save: ${actionError}` };

  await logAudit({
    context,
    action: "spot_check.recorded",
    entity: "user",
    entityId: userId,
    detail: { checkedOn, outcome, clientId: clientId || null, actions: agreed.length },
  });
  revalidatePath(`/org/staff/${userId}`);
  return { ok: true, id: row.id };
}

/** Record a competency assessment: one area, against its own criteria. */
export async function recordCompetencyAction(_prev: CheckState, formData: FormData): Promise<CheckState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };

  const userId = str(formData, "userId");
  const area = str(formData, "area");
  const checkedOn = str(formData, "checkedOn");
  const outcome = str(formData, "outcome");
  const notes = str(formData, "notes");
  const nextDue = str(formData, "nextDue");
  const agreed = parseAgreedActions(String(formData.get("agreed") ?? ""));
  const actionsDue = str(formData, "actionsDue");

  const form = competencyForm(area, COMPETENCY_FORMS);
  if (!form) return { ok: false, error: "Pick the skill being assessed." };
  if (!ISO_DATE.test(checkedOn)) return { ok: false, error: "Say when it was assessed." };
  const criteria = readCheckAnswers(form.items, json(formData, "criteria"));
  if (!criteria.ok) return { ok: false, error: criteria.error };
  if (!OUTCOMES.includes(outcome)) return { ok: false, error: "Pick the outcome." };
  if (notes.length > 5000) return { ok: false, error: "Keep the notes under 5000 characters." };

  const supabase = await createClient();
  if (!(await carerInOrg(supabase, userId))) return { ok: false, error: "Competency assessments are for carers in your organisation." };

  const { data: row, error } = await supabase
    .from("competency_checks")
    .insert({
      organisation_id: context.organisationId,
      user_id: userId,
      assessor_id: context.userId,
      area,
      outcome,
      checked_on: checkedOn,
      criteria: criteria.answers,
      notes: notes || null,
      next_due: ISO_DATE.test(nextDue) ? nextDue : null,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const actionError = await addActions(
    supabase,
    { organisationId: context.organisationId!, userId, createdBy: context.userId, sourceType: "competency", sourceId: row.id },
    agreed,
    actionsDue,
  );
  if (actionError) return { ok: false, id: row.id, error: `Saved the assessment, but the actions did not save: ${actionError}` };

  await logAudit({
    context,
    action: "competency.recorded",
    entity: "user",
    entityId: userId,
    detail: { area, outcome, checkedOn, actions: agreed.length },
  });
  revalidatePath(`/org/staff/${userId}`);
  return { ok: true, id: row.id };
}

/**
 * Assign a course a failed spot check or competency suggested, because a
 * manager decided to — never on its own (STAFF-AUDITS.md, Follow-up). The
 * record reads "the manager reviewed it and assigned training", as with
 * incidents (assignSuggestedTrainingAction).
 */
export async function assignAuditTrainingAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };

  const sourceType = str(formData, "sourceType");
  const sourceId = str(formData, "sourceId");
  const userId = str(formData, "userId");
  const courseId = str(formData, "courseId");
  const reason = str(formData, "reason").slice(0, 500);
  const dueDate = str(formData, "dueDate");
  if (sourceType !== "spot_check" && sourceType !== "competency") return { ok: false, error: "Missing the record." };
  if (!sourceId || !userId || !courseId) return { ok: false, error: "Missing the record, the person or the course." };

  const supabase = await createClient();
  // The record must be theirs and this person's: read under RLS.
  const { data: source } = await supabase
    .from(sourceType === "spot_check" ? "spot_checks" : "competency_checks")
    .select("id")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!source) return { ok: false, error: "That record is not in your organisation." };
  const { data: target } = await supabase.from("users").select("id").eq("id", userId).eq("status", "active").maybeSingle();
  if (!target) return { ok: false, error: "That person is not an active carer in your organisation." };

  const { error: enrolError } = await supabase.from("enrolments").upsert(
    { organisation_id: context.organisationId, user_id: userId, course_id: courseId, due_date: ISO_DATE.test(dueDate) ? dueDate : null },
    { onConflict: "user_id,course_id" },
  );
  if (enrolError) return { ok: false, error: enrolError.message };

  const { error: linkError } = await supabase.from("staff_audit_training").insert({
    organisation_id: context.organisationId,
    user_id: userId,
    source_type: sourceType,
    source_id: sourceId,
    course_id: courseId,
    reason: reason || null,
    assigned_by: context.userId,
  });
  // The training is assigned either way; a second click is not a failure.
  if (linkError && !linkError.message.includes("duplicate")) return { ok: false, error: linkError.message };

  const origin = await siteOrigin();
  const organisationId = context.organisationId!;
  after(async () => {
    const admin = createAdminClient();
    const { data: course } = await admin.from("courses").select("title").eq("id", courseId).maybeSingle();
    await emailAssignees(
      admin,
      "training_assigned",
      [{ userId, title: (course?.title as string | undefined) ?? "A course", dueDate: ISO_DATE.test(dueDate) ? dueDate : null, href: "/learn/modules" }],
      { organisationId, assignedBy: context.userId, origin },
    );
  });

  await logAudit({
    context,
    action: `${sourceType}.training_assigned`,
    entity: "user",
    entityId: userId,
    detail: { sourceId, courseId, reason: reason || null },
  });
  revalidatePath(`/org/staff/${userId}`);
  return { ok: true };
}

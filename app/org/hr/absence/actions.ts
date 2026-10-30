"use server";

import { revalidatePath } from "next/cache";
import { requireConsole, type UserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sanitiseWith, validateSection, type FieldError } from "@/lib/recruitment-application";
import { ABSENCE_REASONS, EXCLUDED_REASONS, RTW_SECTIONS } from "@/lib/hr/absence";
import { HR_BUCKET, hrPerson, type Admin } from "@/lib/hr/server";
import { fileFromDataUrl } from "@/lib/data-url";

/**
 * Sickness absence (HR-PACK.md). Every action runs as the service role after
 * checking the absence (or the person) is this company's, on the HR pack.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
type Result = { ok: boolean; error?: string; id?: string };

export interface AbsenceInput {
  startDate: string;
  returnedOn: string;
  reason: string;
  reasonDetail: string;
  certification: string;
  excluded: boolean;
  exclusionReason: string;
}

function clean(input: AbsenceInput): { row?: Record<string, unknown>; error?: string } {
  if (!ISO.test(input.startDate)) return { error: "Choose the first day off." };
  if (input.returnedOn && !ISO.test(input.returnedOn)) return { error: "Check the return date." };
  if (input.returnedOn && input.returnedOn <= input.startDate) return { error: "They came back after they went off: check the dates." };
  if (!ABSENCE_REASONS.includes(input.reason)) return { error: "Choose the reason." };
  const certification = ["self", "fit_note", "none"].includes(input.certification) ? input.certification : "self";
  // Pregnancy-related and work injuries never count; the office can leave others out, with a reason.
  const excluded = EXCLUDED_REASONS.includes(input.reason) || input.excluded;
  const exclusionReason = EXCLUDED_REASONS.includes(input.reason) ? input.reason : input.exclusionReason.replace(/\s+/g, " ").trim().slice(0, 200);
  if (excluded && !exclusionReason) return { error: "Say why it's left out of the triggers (for example, related to a disability)." };
  return {
    row: {
      start_date: input.startDate,
      returned_on: input.returnedOn || null,
      reason: input.reason,
      reason_detail: input.reasonDetail.replace(/\r/g, "").trim().slice(0, 1000) || null,
      certification,
      excluded_from_triggers: excluded,
      exclusion_reason: excluded ? exclusionReason : null,
    },
  };
}

async function loadAbsence(admin: Admin, context: UserContext, id: string) {
  const { data } = await admin.from("sickness_absences").select("*").eq("id", id).maybeSingle();
  if (!data || data.organisation_id !== context.organisationId) return null;
  if (!(await hrPerson(admin, context.organisationId, data.user_id as string))) return null;
  return data;
}

const done = (userId: string, id?: string) => {
  revalidatePath(`/org/staff/${userId}`);
  revalidatePath("/org/hr/absence");
  if (id) revalidatePath(`/org/hr/absence/${id}`);
};

export async function recordAbsenceAction(userId: string, input: AbsenceInput): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  if (!(await hrPerson(admin, context.organisationId, userId))) return { ok: false, error: "That person is not one of your staff." };
  const { row, error } = clean(input);
  if (!row) return { ok: false, error };
  // Two spells for the same days is a mistake, not two absences.
  const { data: overlap } = await admin
    .from("sickness_absences")
    .select("id")
    .eq("user_id", userId)
    .lte("start_date", (row.returned_on as string | null) ?? "9999-12-31")
    .or(`returned_on.is.null,returned_on.gt.${row.start_date}`)
    .limit(1);
  if (overlap?.length) return { ok: false, error: "They already have an absence over those dates. Open it and change it instead." };
  const { data, error: insErr } = await admin
    .from("sickness_absences")
    .insert({ ...row, organisation_id: context.organisationId, user_id: userId, reported_by: context.userId })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: "That didn't save. Try again." };
  await logAudit({ context, action: "hr.absence_recorded", entity: "user", entityId: userId, detail: { absence: data.id, reason: row.reason } });
  done(userId);
  return { ok: true, id: data.id as string };
}

export async function updateAbsenceAction(id: string, input: AbsenceInput): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const absence = await loadAbsence(admin, context, id);
  if (!absence) return { ok: false, error: "Absence not found." };
  const { row, error } = clean(input);
  if (!row) return { ok: false, error };
  const { error: upErr } = await admin.from("sickness_absences").update(row).eq("id", id);
  if (upErr) return { ok: false, error: "That didn't save. Try again." };
  await logAudit({ context, action: "hr.absence_updated", entity: "user", entityId: absence.user_id as string, detail: { absence: id } });
  done(absence.user_id as string, id);
  return { ok: true };
}

export async function deleteAbsenceAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const absence = await loadAbsence(admin, context, id);
  if (!absence) return { ok: false, error: "Absence not found." };
  if (absence.fit_note_path) await admin.storage.from(HR_BUCKET).remove([absence.fit_note_path as string]);
  await admin.from("sickness_absences").delete().eq("id", id);
  await logAudit({ context, action: "hr.absence_deleted", entity: "user", entityId: absence.user_id as string, detail: { absence: id, start: absence.start_date } });
  done(absence.user_id as string);
  return { ok: true };
}

/** The fit note: a photo or PDF, with the date it runs to. */
export async function uploadFitNoteAction(id: string, file: { name: string; dataUrl: string }, until: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const absence = await loadAbsence(admin, context, id);
  if (!absence) return { ok: false, error: "Absence not found." };
  if (!ISO.test(until)) return { ok: false, error: "Enter the date the fit note runs to." };
  const { buffer, contentType } = fileFromDataUrl(file.dataUrl);
  if (buffer.length > 10 * 1024 * 1024) return { ok: false, error: "That file is over 10MB." };
  const path = `${context.organisationId}/${absence.user_id as string}/fit-notes/${crypto.randomUUID()}-${file.name.replace(/[^\w.\- ]+/g, "")}`;
  const { error: upErr } = await admin.storage.from(HR_BUCKET).upload(path, buffer, { contentType });
  if (upErr) return { ok: false, error: "The file couldn't be uploaded. Try again." };
  if (absence.fit_note_path) await admin.storage.from(HR_BUCKET).remove([absence.fit_note_path as string]);
  await admin.from("sickness_absences").update({ fit_note_path: path, fit_note_name: file.name.slice(0, 200), fit_note_until: until, certification: "fit_note" }).eq("id", id);
  await logAudit({ context, action: "hr.fit_note_uploaded", entity: "user", entityId: absence.user_id as string, detail: { absence: id, until } });
  done(absence.user_id as string, id);
  return { ok: true };
}

export async function fitNoteUrlAction(id: string): Promise<{ url?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const absence = await loadAbsence(admin, context, id);
  if (!absence?.fit_note_path) return {};
  const { data } = await admin.storage.from(HR_BUCKET).createSignedUrl(absence.fit_note_path as string, 60);
  return { url: data?.signedUrl };
}

/** The return-to-work interview, saved as it's typed and finished on purpose. */
export async function saveRtwAction(id: string, raw: unknown, finish: boolean): Promise<{ ok: boolean; error?: string; problems?: FieldError[] }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const absence = await loadAbsence(admin, context, id);
  if (!absence) return { ok: false, error: "Absence not found." };
  if (!absence.returned_on) return { ok: false, error: "Record the day they came back first." };
  const answers = sanitiseWith(RTW_SECTIONS, raw);
  const today = new Date().toISOString().slice(0, 10);
  if (finish) {
    const problems = RTW_SECTIONS.flatMap((s) => validateSection(s, answers, today));
    if (problems.length) return { ok: false, error: "Some answers still need filling in.", problems };
  }
  const { error } = await admin
    .from("sickness_absences")
    .update({ rtw_answers: answers, ...(finish ? { rtw_status: "held", rtw_held_on: today, rtw_by: context.userId } : {}) })
    .eq("id", id);
  if (error) return { ok: false, error: "That didn't save. Try again." };
  if (finish) await logAudit({ context, action: "hr.return_to_work_held", entity: "user", entityId: absence.user_id as string, detail: { absence: id, dv48: answers.dv48 ?? null } });
  done(absence.user_id as string, id);
  return { ok: true };
}

export async function rtwNotNeededAction(id: string, notNeeded: boolean): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const absence = await loadAbsence(admin, context, id);
  if (!absence) return { ok: false, error: "Absence not found." };
  if (absence.rtw_status === "held") return { ok: false, error: "The interview has been held." };
  await admin.from("sickness_absences").update({ rtw_status: notNeeded ? "not_needed" : "none" }).eq("id", id);
  done(absence.user_id as string, id);
  return { ok: true };
}

export async function addWelfareMeetingAction(id: string, input: { heldOn: string; how: string; notes: string }): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const absence = await loadAbsence(admin, context, id);
  if (!absence) return { ok: false, error: "Absence not found." };
  if (!ISO.test(input.heldOn)) return { ok: false, error: "Choose the date." };
  const notes = input.notes.replace(/\r/g, "").trim().slice(0, 4000);
  if (!notes) return { ok: false, error: "Write what was talked about." };
  const { error } = await admin.from("absence_welfare_meetings").insert({
    organisation_id: context.organisationId,
    absence_id: id,
    held_on: input.heldOn,
    how: input.how.replace(/\s+/g, " ").trim().slice(0, 80) || null,
    notes,
    held_by: context.userId,
  });
  if (error) return { ok: false, error: "That didn't save. Try again." };
  await logAudit({ context, action: "hr.welfare_meeting", entity: "user", entityId: absence.user_id as string, detail: { absence: id, on: input.heldOn } });
  done(absence.user_id as string, id);
  return { ok: true };
}

export async function saveOhReferralAction(id: string, input: { referredOn: string; notes: string }): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const absence = await loadAbsence(admin, context, id);
  if (!absence) return { ok: false, error: "Absence not found." };
  if (input.referredOn && !ISO.test(input.referredOn)) return { ok: false, error: "Check the date." };
  await admin
    .from("sickness_absences")
    .update({ oh_referred_on: input.referredOn || null, oh_notes: input.notes.replace(/\r/g, "").trim().slice(0, 4000) || null })
    .eq("id", id);
  done(absence.user_id as string, id);
  return { ok: true };
}

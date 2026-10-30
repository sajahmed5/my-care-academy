"use server";

import { revalidatePath } from "next/cache";
import { requireConsole, type UserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { askClaudeJson } from "@/lib/ai";
import { sendEmail } from "@/lib/email";
import { esc } from "@/lib/email-layout";
import { orgBranding } from "@/lib/branding";
import { renderHrPdf, ukDate } from "@/lib/hr-pdf";
import { hrLetterHtml, LETTER_DRAFT_SCHEMA } from "@/lib/hr/letters";
import { CHECKLIST, LEAVING_REASONS, factualReference, leaverConsoleBlock, sanitiseChecklist } from "@/lib/hr/leavers";
import { emailTrainingRecord, sendExitLink, switchOffLogin } from "@/lib/hr/leavers-server";
import { HR_BUCKET, hrPerson, letterSigner, personName, type Admin } from "@/lib/hr/server";

/**
 * Leavers (HR-PACK.md). Every action runs as the service role after checking
 * the person is one of this company's staff on the HR pack.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
type Result = { ok: boolean; error?: string; id?: string };
const text = (v: string, max: number) => v.replace(/\r/g, "").trim().slice(0, max);
const line = (v: string, max: number) => v.replace(/\s+/g, " ").trim().slice(0, max);

const done = (userId: string, id?: string) => {
  revalidatePath(`/org/staff/${userId}`);
  revalidatePath("/org/hr/leavers");
  if (id) revalidatePath(`/org/hr/leavers/${id}`);
};

async function loadLeaver(admin: Admin, context: UserContext, id: string) {
  const { data } = await admin.from("hr_leavers").select("*").eq("id", id).maybeSingle();
  if (!data || data.organisation_id !== context.organisationId) return null;
  const person = await hrPerson(admin, context.organisationId, data.user_id as string);
  return person ? { ...data, person_role: person.role } : null;
}

export interface LeaverInput {
  reason: string;
  reasonDetail: string;
  noticeOn: string;
  lastDay: string;
  reEmployable: string;
  reEmployableNote: string;
}

function clean(input: LeaverInput): { row?: Record<string, unknown>; error?: string } {
  if (!LEAVING_REASONS.some((r) => r.value === input.reason)) return { error: "Choose why they're leaving." };
  if (!ISO.test(input.lastDay)) return { error: "Set their last working day." };
  if (input.noticeOn && !ISO.test(input.noticeOn)) return { error: "Check the notice date." };
  if (input.noticeOn && input.noticeOn > input.lastDay) return { error: "Notice is given before the last day." };
  const re = ["yes", "no", "with_conditions"].includes(input.reEmployable) ? input.reEmployable : "yes";
  return {
    row: {
      reason: input.reason,
      reason_detail: text(input.reasonDetail, 2000) || null,
      notice_on: input.noticeOn || null,
      last_day: input.lastDay,
      re_employable: re,
      re_employable_note: re === "yes" ? null : text(input.reEmployableNote, 1000) || null,
    },
  };
}

export async function recordLeaverAction(userId: string, input: LeaverInput): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const person = await hrPerson(admin, context.organisationId, userId);
  if (!person) return { ok: false, error: "That person is not one of your staff." };
  if (person.id === context.userId) return { ok: false, error: "Another manager records your leaving." };
  const blocked = leaverConsoleBlock(context.role, person.role);
  if (blocked) return { ok: false, error: blocked };
  const { row, error } = clean(input);
  if (!row) return { ok: false, error };
  const { data: existing } = await admin.from("hr_leavers").select("id").eq("user_id", userId).maybeSingle();
  if (existing) return { ok: false, error: "They already have a leaving record.", id: existing.id as string };
  const { data, error: insErr } = await admin
    .from("hr_leavers")
    .insert({ ...row, organisation_id: context.organisationId, user_id: userId, created_by: context.userId })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: "That didn't save. Try again." };
  await logAudit({ context, action: "hr.leaver_recorded", entity: "user", entityId: userId, detail: { reason: row.reason, lastDay: row.last_day } });
  done(userId);
  return { ok: true, id: data.id as string };
}

export async function updateLeaverAction(id: string, input: LeaverInput): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const l = await loadLeaver(admin, context, id);
  if (!l) return { ok: false, error: "Not found." };
  // The last day decides when their login goes off.
  const blocked = leaverConsoleBlock(context.role, l.person_role);
  if (blocked) return { ok: false, error: blocked };
  const { row, error } = clean(input);
  if (!row) return { ok: false, error };
  await admin.from("hr_leavers").update(row).eq("id", id);
  done(l.user_id as string, id);
  return { ok: true };
}

/** They're staying after all: only before their login has gone. */
export async function cancelLeaverAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const l = await loadLeaver(admin, context, id);
  if (!l) return { ok: false, error: "Not found." };
  if (l.login_off_at) return { ok: false, error: "Their login has been switched off. Reactivate them from the Staff list first." };
  await admin.from("hr_leavers").delete().eq("id", id);
  await logAudit({ context, action: "hr.leaver_cancelled", entity: "user", entityId: l.user_id as string });
  done(l.user_id as string);
  return { ok: true };
}

export async function checklistAction(id: string, key: string, item: { done: boolean; on: string; note: string }): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const l = await loadLeaver(admin, context, id);
  if (!l) return { ok: false, error: "Not found." };
  if (!CHECKLIST.some((c) => c.key === key)) return { ok: false, error: "Unknown item." };
  const list = sanitiseChecklist(l.checklist);
  list[key] = { done: item.done, on: item.done ? (ISO.test(item.on) ? item.on : new Date().toISOString().slice(0, 10)) : null, note: text(item.note, 2000) || null };
  await admin.from("hr_leavers").update({ checklist: list }).eq("id", id);
  done(l.user_id as string, id);
  return { ok: true };
}

export async function askExitInterviewAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const l = await loadLeaver(admin, context, id);
  if (!l) return { ok: false, error: "Not found." };
  if (l.exit_status === "done") return { ok: false, error: "They've answered it." };
  const sent = await sendExitLink(admin, context.organisationId!, id, l.user_id as string);
  done(l.user_id as string, id);
  return sent ? { ok: true } : { ok: false, error: "The email didn't send: they may have no email address." };
}

export async function exitDeclinedAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const l = await loadLeaver(admin, context, id);
  if (!l) return { ok: false, error: "Not found." };
  await admin.from("hr_leavers").update({ exit_status: "declined", exit_token_hash: null }).eq("id", id);
  done(l.user_id as string, id);
  return { ok: true };
}

export async function emailTrainingRecordAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const l = await loadLeaver(admin, context, id);
  if (!l) return { ok: false, error: "Not found." };
  const r = await emailTrainingRecord(admin, context.organisationId!, l.user_id as string);
  if (r.ok) await logAudit({ context, action: "hr.training_record_emailed", entity: "user", entityId: l.user_id as string });
  done(l.user_id as string, id);
  return r;
}

export async function switchOffNowAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const l = await loadLeaver(admin, context, id);
  if (!l) return { ok: false, error: "Not found." };
  if (l.user_id === context.userId) return { ok: false, error: "You can't switch off your own login." };
  const blocked = leaverConsoleBlock(context.role, l.person_role);
  if (blocked) return { ok: false, error: blocked };
  const r = await switchOffLogin(admin, context.organisationId!, l.user_id as string);
  if (r.ok) await logAudit({ context, action: "hr.leaver_login_off", entity: "user", entityId: l.user_id as string, detail: { by: "hand" } });
  done(l.user_id as string, id);
  return r;
}

export async function leaverDbsAction(id: string, status: string, on: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const l = await loadLeaver(admin, context, id);
  if (!l) return { ok: false, error: "Not found." };
  if (!["unknown", "needed", "not_needed", "done"].includes(status)) return { ok: false, error: "Not recognised." };
  if (status === "done" && !ISO.test(on)) return { ok: false, error: "When was it made?" };
  await admin.from("hr_leavers").update({ dbs_referral: status, dbs_referral_on: status === "done" ? on : null }).eq("id", id);
  await logAudit({ context, action: "hr.leaver_dbs_referral", entity: "user", entityId: l.user_id as string, detail: { status, on } });
  done(l.user_id as string, id);
  return { ok: true };
}

// ─── References given ───────────────────────────────────────────────────────

async function referenceFacts(admin: Admin, orgId: string, userId: string) {
  const [{ data: person }, { data: org }, { data: emp }, { data: leaver }] = await Promise.all([
    admin.from("users").select("full_name, email, role").eq("id", userId).maybeSingle(),
    admin.from("organisations").select("name").eq("id", orgId).maybeSingle(),
    admin.from("staff_employment").select("start_date, job_title").eq("user_id", userId).maybeSingle(),
    admin.from("hr_leavers").select("last_day, reason").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    fullName: personName((person ?? { full_name: null, email: null }) as never),
    companyName: (org?.name as string | undefined) ?? "",
    jobTitle: (emp?.job_title as string | null) || (person?.role === "learner" ? "a carer" : "a member of staff"),
    startDate: emp?.start_date ? ukDate(emp.start_date as string) : null,
    lastDay: leaver?.last_day ? ukDate(leaver.last_day as string) : "the present day",
    reason: (leaver?.reason as string | undefined) ?? "other",
  };
}

/** A new employer's request: recorded, with a factual reference drafted from the file. */
export async function newReferenceRequestAction(userId: string, input: { requesterName: string; requesterOrg: string; requesterEmail: string; receivedOn: string }): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  if (!(await hrPerson(admin, context.organisationId, userId))) return { ok: false, error: "That person is not one of your staff." };
  const name = line(input.requesterName, 120);
  const email = line(input.requesterEmail, 200).toLowerCase();
  if (!name) return { ok: false, error: "Who asked for it?" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Check their email address." };
  const facts = await referenceFacts(admin, context.organisationId!, userId);
  const { data, error } = await admin
    .from("hr_references_given")
    .insert({
      organisation_id: context.organisationId,
      user_id: userId,
      requester_name: name,
      requester_org: line(input.requesterOrg, 200) || null,
      requester_email: email || null,
      received_on: ISO.test(input.receivedOn) ? input.receivedOn : new Date().toISOString().slice(0, 10),
      body: factualReference({ ...facts, requesterName: name }),
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "That didn't save. Try again." };
  await logAudit({ context, action: "hr.reference_requested", entity: "user", entityId: userId, detail: { from: name } });
  done(userId);
  return { ok: true, id: data.id as string };
}

async function loadReference(admin: Admin, context: UserContext, id: string) {
  const { data } = await admin.from("hr_references_given").select("*").eq("id", id).maybeSingle();
  if (!data || data.organisation_id !== context.organisationId) return null;
  return (await hrPerson(admin, context.organisationId, data.user_id as string)) ? data : null;
}

export async function saveReferenceAction(id: string, body: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const r = await loadReference(admin, context, id);
  if (!r) return { ok: false, error: "Not found." };
  if (r.status === "sent") return { ok: false, error: "It has been sent." };
  await admin.from("hr_references_given").update({ body: text(body, 8000) }).eq("id", id);
  return { ok: true };
}

export async function draftReferenceWithAiAction(id: string, notes: string): Promise<{ ok: boolean; body?: string; error?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const r = await loadReference(admin, context, id);
  if (!r) return { ok: false, error: "Not found." };
  const facts = await referenceFacts(admin, context.organisationId!, r.user_id as string);
  const ai = await askClaudeJson<{ subject: string; paragraphs: string[] }>({
    orgId: context.organisationId!,
    userId: context.userId,
    feature: "hr_reference",
    prompt: `You are writing a reference from a UK home-care company, ${facts.companyName || "the employer"}, about a former member of staff, for ${line(r.requester_name as string, 120)}${r.requester_org ? ` at ${line(r.requester_org as string, 200)}` : ""}.

A reference must be true, accurate and fair, and must not give a misleading impression. Keep to the facts below; never invent anything. Plain British English. Don't add a greeting or a sign-off.

Facts from the file:
- Name: ${facts.fullName}
- Role: ${facts.jobTitle}
- Employed from: ${facts.startDate ?? "not recorded"}
- Until: ${facts.lastDay}
- Reason for leaving: ${facts.reason}

The current draft:
"""
${r.body as string}
"""

The manager's notes (only include what they say to include):
"""
${text(notes, 3000) || "(none: keep it factual)"}
"""

Return JSON: { "subject": "…", "paragraphs": ["…"] }.`,
    schema: LETTER_DRAFT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 2000,
  });
  if (!ai.ok) return { ok: false, error: ai.error };
  return { ok: true, body: ai.data.paragraphs.map((p) => p.trim()).filter(Boolean).join("\n\n").slice(0, 8000) };
}

/** A manager checks and sends it: emailed to the new employer and kept as a PDF. */
export async function sendReferenceAction(id: string, body: string): Promise<Result> {
  const context = await requireConsole();
  if (context.role !== "org_admin") return { ok: false, error: "A manager checks and sends references." };
  const admin = createAdminClient();
  const r = await loadReference(admin, context, id);
  if (!r) return { ok: false, error: "Not found." };
  if (r.status === "sent") return { ok: false, error: "It has been sent." };
  if (!r.requester_email) return { ok: false, error: "Add the email address to send it to (or download it and post it)." };
  const content = text(body, 8000);
  if (!content) return { ok: false, error: "The reference is empty." };
  const [{ data: org }, signer, facts, brand] = await Promise.all([
    admin.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(),
    letterSigner(admin, context.organisationId!, context.userId),
    referenceFacts(admin, context.organisationId!, r.user_id as string),
    orgBranding(context.organisationId),
  ]);
  const company = (org?.name as string | undefined) ?? "";
  const today = ukDate(new Date().toISOString());
  const subject = `Reference for ${facts.fullName}`;
  const greeting = `Dear ${line(r.requester_name as string, 120)},`;
  const pdf = await renderHrPdf(company, [
    {
      title: subject,
      subtitle: `${line(r.requester_name as string, 120)}${r.requester_org ? `, ${line(r.requester_org as string, 200)}` : ""} · ${today}`,
      blocks: [
        { type: "para", text: greeting },
        ...content.split(/\n{2,}/).map((t) => ({ type: "para" as const, text: t.trim() })),
        { type: "para", text: "Yours sincerely," },
        { type: "signature", name: signer.name || company, title: [signer.title, company].filter(Boolean).join(", ") },
      ],
    },
  ], brand?.logoUrl);
  const path = `${context.organisationId}/${r.user_id as string}/references/${id}.pdf`;
  const { error: upErr } = await admin.storage.from(HR_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) return { ok: false, error: "It couldn't be saved as a PDF. Try again." };
  const sent = await sendEmail({
    to: r.requester_email as string,
    organisationId: context.organisationId,
    subject: `${subject}${company ? `, from ${company}` : ""}`,
    html: hrLetterHtml({ company, date: today, greeting, body: content, fixed: [], signer }).replace(
      "A copy is kept on your file, and you can read it when you sign in.",
      `Sent in confidence. ${esc("A copy is kept with the employee's file.")}`,
    ),
    attachments: [{ filename: `${subject}.pdf`, content: pdf.toString("base64") }],
  });
  if (!sent) return { ok: false, error: "The email didn't send. Try again in a minute." };
  await admin
    .from("hr_references_given")
    .update({ body: content, status: "sent", sent_at: new Date().toISOString(), sent_to: r.requester_email, sent_by: context.userId, pdf_path: path })
    .eq("id", id);
  await logAudit({ context, action: "hr.reference_sent", entity: "user", entityId: r.user_id as string, detail: { to: r.requester_email } });
  done(r.user_id as string);
  return { ok: true };
}

export async function deleteReferenceDraftAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const r = await loadReference(admin, context, id);
  if (!r) return { ok: false, error: "Not found." };
  if (r.status === "sent") return { ok: false, error: "A sent reference stays on record." };
  await admin.from("hr_references_given").delete().eq("id", id);
  done(r.user_id as string);
  return { ok: true };
}

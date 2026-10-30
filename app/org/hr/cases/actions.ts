"use server";

import { revalidatePath } from "next/cache";
import { requireConsole, type UserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { siteOrigin } from "@/lib/site-url";
import { hashToken, newToken } from "@/lib/candidate-links";
import { validSignature } from "@/lib/signing-documents";
import { ukDate } from "@/lib/hr-pdf";
import { addDays } from "@/lib/hr/probation";
import { monthsText } from "@/lib/hr/letters";
import { APPEAL_IN_LETTER, appealLabel, appealable, caseSettingsFromRow, enoughNotice, outcomeLabel, warningExpiry, type CaseKind } from "@/lib/hr/cases";
import { hasCaseAccess, loadCase } from "@/lib/hr/case-access";
import { HR_BUCKET, createLetterDraft, hrPerson, personName, type Admin, type Person } from "@/lib/hr/server";
import { createCase } from "@/lib/hr/cases-server";

/**
 * Disciplinary and grievance cases (HR-PACK.md). Every action runs as the
 * service role after loadCase() has checked what can_see_hr_case() checks:
 * a manager or a named office worker, never the employee or the person a
 * grievance is about. Letters are drafts for a person to check and send.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
type Result = { ok: boolean; error?: string; letterId?: string; id?: string };
const text = (v: string, max: number) => v.replace(/\r/g, "").trim().slice(0, max);
const line = (v: string, max: number) => v.replace(/\s+/g, " ").trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

const done = (c: Record<string, unknown>) => {
  revalidatePath(`/org/hr/cases/${c.id as string}`);
  revalidatePath("/org/hr/cases");
  revalidatePath(`/org/staff/${c.user_id as string}`);
};

async function caseSettings(admin: Admin, orgId: string) {
  const { data } = await admin.from("hr_settings").select("*").eq("organisation_id", orgId).maybeSingle();
  return caseSettingsFromRow(data);
}

/** The case, its employee, and the caller — or why not. */
async function gate(context: UserContext, id: string): Promise<{ admin: Admin; c: Record<string, unknown>; person: Person } | null> {
  const admin = createAdminClient();
  const c = await loadCase(admin, context, id);
  if (!c) return null;
  const person = await hrPerson(admin, context.organisationId, c.user_id as string);
  return person ? { admin, c, person } : null;
}

async function event(admin: Admin, c: Record<string, unknown>, by: string, body: string) {
  await admin.from("hr_case_notes").insert({ organisation_id: c.organisation_id, case_id: c.id, kind: "event", body, created_by: by });
}

const processOf = (c: Record<string, unknown>) => (c.subtype === "capability" ? "capability" : "disciplinary");
const NOT_FOUND = { ok: false, error: "Case not found." };

// ─── Opening ────────────────────────────────────────────────────────────────

export interface OpenCaseInput {
  kind: CaseKind;
  subtype: string;
  userId: string;
  aboutUserId: string;
  summary: string;
  raisedVia: string;
  linkedType: string;
  linkedId: string;
  linkedLabel: string;
}

export async function openCaseAction(input: OpenCaseInput): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  if (!(await hasCaseAccess(admin, context))) return { ok: false, error: "Only managers, and office workers a manager has named, can open a case." };
  const person = await hrPerson(admin, context.organisationId, input.userId);
  if (!person) return { ok: false, error: "Choose one of your staff." };
  if (person.id === context.userId) return { ok: false, error: "You can't open a case about yourself: another manager does." };
  const kind: CaseKind = input.kind === "grievance" ? "grievance" : "disciplinary";
  const summary = text(input.summary, 4000);
  if (!summary) return { ok: false, error: kind === "grievance" ? "Write what the grievance is about." : "Write what the concern is." };
  let about: string | null = null;
  if (kind === "grievance" && input.aboutUserId) {
    const a = await hrPerson(admin, context.organisationId, input.aboutUserId);
    if (!a) return { ok: false, error: "The person it's about isn't one of your staff." };
    if (a.id === context.userId) return { ok: false, error: "This grievance is about you, so another manager must open it: you won't be able to see it." };
    about = a.id;
  }
  const r = await createCase(admin, {
    orgId: context.organisationId!,
    kind,
    subtype: input.subtype,
    userId: person.id,
    aboutUserId: about,
    summary,
    raisedVia: input.raisedVia,
    raisedBy: context.userId,
    linkedType: input.linkedType,
    linkedId: input.linkedId,
    linkedLabel: input.linkedLabel,
    by: context.email ?? "the office",
  });
  if (!r.id) return { ok: false, error: "The case couldn't be opened. Try again." };
  await logAudit({ context, action: "hr.case_opened", entity: "hr_case", entityId: r.id, detail: { kind, ref: r.ref, person: person.id } });
  revalidatePath("/org/hr/cases");
  return { ok: true, id: r.id };
}

// ─── Disciplinary: suspension, investigation ────────────────────────────────

export async function suspendAction(id: string, input: { on: string; reason: string; reviewOn: string }): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c, person } = g;
  if (c.kind !== "disciplinary") return { ok: false, error: "Only a disciplinary case has a suspension." };
  if (!ISO.test(input.on) || !ISO.test(input.reviewOn)) return { ok: false, error: "Set the date it starts and when it will be reviewed." };
  const reason = text(input.reason, 2000);
  if (!reason) return { ok: false, error: "Say why: suspension needs a reason." };
  await admin.from("hr_cases").update({ suspended_on: input.on, suspension_reason: reason, suspension_review_on: input.reviewOn, suspension_ended_on: null }).eq("id", id);
  await event(admin, c, context.userId, `Suspended on full pay from ${ukDate(input.on)}, to be reviewed by ${ukDate(input.reviewOn)}.`);
  const letter = await createLetterDraft(admin, {
    orgId: context.organisationId!,
    person,
    kind: "case_suspension",
    sourceType: "case",
    sourceId: id,
    values: { date: ukDate(input.on), details: reason },
    by: context.userId,
  });
  await logAudit({ context, action: "hr.case_suspension", entity: "hr_case", entityId: id, detail: { on: input.on } });
  done(c);
  return { ok: true, letterId: letter.id };
}

export async function reviewSuspensionAction(id: string, input: { endOn: string; nextReviewOn: string }): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c } = g;
  if (input.endOn) {
    if (!ISO.test(input.endOn)) return { ok: false, error: "Check the date." };
    await admin.from("hr_cases").update({ suspension_ended_on: input.endOn }).eq("id", id);
    await event(admin, c, context.userId, `Suspension ended ${ukDate(input.endOn)}.`);
  } else {
    if (!ISO.test(input.nextReviewOn)) return { ok: false, error: "Set the next review date." };
    await admin.from("hr_cases").update({ suspension_review_on: input.nextReviewOn }).eq("id", id);
    await event(admin, c, context.userId, `Suspension reviewed: it continues, next review ${ukDate(input.nextReviewOn)}.`);
  }
  done(c);
  return { ok: true };
}

export async function setInvestigatorAction(id: string, investigatorId: string): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c } = g;
  const who = await hrPerson(admin, context.organisationId, investigatorId);
  if (!who || who.role === "learner") return { ok: false, error: "Choose a manager or office worker." };
  if (who.id === c.user_id || who.id === c.about_user_id) return { ok: false, error: "They can't investigate a case about themselves." };
  if (who.role === "org_office") {
    const s = await caseSettings(admin, context.organisationId!);
    if (!s.officeAccess.includes(who.id)) return { ok: false, error: `${personName(who)} can't see cases yet. A manager gives them access under Settings → HR → Disciplinary and grievance.` };
  }
  const stage = c.kind === "disciplinary" && c.stage === "concern" ? "investigation" : (c.stage as string);
  await admin.from("hr_cases").update({ investigator_id: who.id, stage }).eq("id", id);
  await event(admin, c, context.userId, `${personName(who)} named as investigator.`);
  done(c);
  return { ok: true };
}

export async function saveReportAction(id: string, input: { report: string; recommendation: string }): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c } = g;
  const report = text(input.report, 12000);
  const rec = ["no_case", "informal", "hearing"].includes(input.recommendation) ? input.recommendation : null;
  if (c.kind === "disciplinary" && !rec) return { ok: false, error: "Choose the recommendation." };
  if (!report) return { ok: false, error: "Write the report: what was found, and why." };
  await admin.from("hr_cases").update({ investigation_report: report, recommendation: rec }).eq("id", id);
  await event(admin, c, context.userId, rec ? `Investigation report written: recommends ${rec === "hearing" ? "a hearing" : rec === "informal" ? "dealing with it informally" : "no case to answer"}.` : "Investigation report written.");
  done(c);
  return { ok: true };
}

// ─── Notes, evidence, statements ────────────────────────────────────────────

export async function addNoteAction(id: string, body: string): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const note = text(body, 4000);
  if (!note) return { ok: false, error: "Write the note." };
  await g.admin.from("hr_case_notes").insert({ organisation_id: context.organisationId, case_id: id, kind: "note", body: note, created_by: context.userId });
  done(g.c);
  return { ok: true };
}

export async function uploadEvidenceAction(id: string, file: { name: string; dataUrl: string }, note: string): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const buffer = Buffer.from(file.dataUrl.split(",")[1] ?? "", "base64");
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) return { ok: false, error: "Choose a file up to 15MB." };
  const name = file.name.replace(/[^\w.\- ]+/g, "").slice(0, 120) || "evidence";
  const path = `${context.organisationId}/cases/${id}/${crypto.randomUUID()}-${name}`;
  const { error } = await g.admin.storage.from(HR_BUCKET).upload(path, buffer);
  if (error) return { ok: false, error: "The file couldn't be uploaded. Try again." };
  await g.admin.from("hr_case_notes").insert({
    organisation_id: context.organisationId,
    case_id: id,
    kind: "evidence",
    body: text(note, 1000),
    file_path: path,
    file_name: name,
    created_by: context.userId,
  });
  await logAudit({ context, action: "hr.case_evidence", entity: "hr_case", entityId: id, detail: { file: name } });
  done(g.c);
  return { ok: true };
}

export async function evidenceUrlAction(noteId: string): Promise<{ url?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const { data: n } = await admin.from("hr_case_notes").select("case_id, file_path").eq("id", noteId).maybeSingle();
  if (!n?.file_path || !(await loadCase(admin, context, n.case_id as string))) return {};
  const { data } = await admin.storage.from(HR_BUCKET).createSignedUrl(n.file_path as string, 60);
  return { url: data?.signedUrl };
}

/** A statement typed by the investigator and signed on the spot. */
export async function addTypedStatementAction(id: string, input: { name: string; statement: string; signature: string; signedName: string }): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const name = line(input.name, 120);
  const statement = text(input.statement, 20000);
  if (!name || !statement) return { ok: false, error: "Give the witness's name and their statement." };
  if (!validSignature(input.signature) || !line(input.signedName, 120)) return { ok: false, error: "The witness signs and types their name." };
  await g.admin.from("hr_case_statements").insert({
    organisation_id: context.organisationId,
    case_id: id,
    witness_name: name,
    method: "typed",
    statement,
    signature: input.signature,
    signed_name: line(input.signedName, 120),
    signed_at: new Date().toISOString(),
    status: "signed",
    created_by: context.userId,
  });
  await event(g.admin, g.c, context.userId, `Witness statement from ${name}, typed and signed.`);
  done(g.c);
  return { ok: true };
}

/** Send the witness a link to write and sign their own statement. */
export async function sendStatementLinkAction(id: string, input: { name: string; email: string }): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const name = line(input.name, 120);
  const email = line(input.email, 200).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Give the witness's name and email." };
  const raw = newToken();
  const { error } = await g.admin.from("hr_case_statements").insert({
    organisation_id: context.organisationId,
    case_id: id,
    witness_name: name,
    witness_email: email,
    method: "link",
    status: "sent",
    token_hash: hashToken(raw),
    token_expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    created_by: context.userId,
  });
  if (error) return { ok: false, error: "That didn't save. Try again." };
  const [{ data: org }, origin] = await Promise.all([g.admin.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(), siteOrigin()]);
  const orgName = (org?.name as string | undefined) ?? "An employer";
  const sent = await sendEmail({
    to: email,
    subject: `${orgName}: a witness statement`,
    html: emailLayout({
      body: `<p>Hello ${esc(name)},</p>
<p>${esc(orgName)} is looking into a workplace matter and has asked for your account of what you saw or heard. Please write it in your own words, as fully and accurately as you can, and sign it.</p>
<p>What you write is kept confidential to the people dealing with the matter.</p>
${emailButton(`${origin}/statement?t=${encodeURIComponent(raw)}`, "Write your statement")}
<p style="color:#64748b;font-size:13px">The link works for 14 days.</p>`,
      footer: `My Care Academy — sent for ${esc(orgName)}.`,
    }),
  });
  await event(g.admin, g.c, context.userId, `Witness statement asked of ${name} by email${sent ? "" : " (the email didn't send)"}.`);
  done(g.c);
  return sent ? { ok: true } : { ok: false, error: "Saved, but the email didn't send. Try again later." };
}

// ─── Meetings and minutes ───────────────────────────────────────────────────

export async function addMeetingAction(
  id: string,
  input: { kind: string; heldOn: string; attendees: string; accompaniedBy: string; minutes: string },
): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const kind = ["investigation", "hearing", "meeting", "appeal"].includes(input.kind) ? input.kind : "meeting";
  if (!ISO.test(input.heldOn)) return { ok: false, error: "Set the date." };
  const minutes = text(input.minutes, 40000);
  if (!minutes) return { ok: false, error: "Type the minutes." };
  const { data, error } = await g.admin
    .from("hr_case_meetings")
    .insert({
      organisation_id: context.organisationId,
      case_id: id,
      kind,
      held_on: input.heldOn,
      attendees: line(input.attendees, 500) || null,
      accompanied_by: line(input.accompaniedBy, 200) || null,
      minutes,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "That didn't save. Try again." };
  await event(g.admin, g.c, context.userId, `Minutes of the ${kind === "meeting" ? "grievance meeting" : `${kind}${kind === "appeal" ? " hearing" : kind === "investigation" ? " meeting" : ""}`} on ${ukDate(input.heldOn)}.`);
  done(g.c);
  return { ok: true, id: data.id as string };
}

/** The employee signs the minutes as accurate, or the manager records that they refused. */
export async function signMinutesAction(meetingId: string, input: { signature: string; signedName: string; refused: boolean; refusedNote: string }): Promise<Result> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const { data: m } = await admin.from("hr_case_meetings").select("case_id, employee_signed_at, refused_to_sign").eq("id", meetingId).maybeSingle();
  if (!m) return NOT_FOUND;
  const g = await gate(context, m.case_id as string);
  if (!g) return NOT_FOUND;
  if (m.employee_signed_at || m.refused_to_sign) return { ok: false, error: "Already done." };
  if (input.refused) {
    const note = text(input.refusedNote, 1000);
    if (!note) return { ok: false, error: "Say what they said: why they didn't sign." };
    await admin.from("hr_case_meetings").update({ refused_to_sign: true, refused_note: note }).eq("id", meetingId);
    await event(admin, g.c, context.userId, "The employee refused to sign the minutes; the reason is recorded.");
  } else {
    if (!validSignature(input.signature) || !line(input.signedName, 120)) return { ok: false, error: "They sign and type their name." };
    await admin
      .from("hr_case_meetings")
      .update({ employee_signature: input.signature, employee_signed_name: line(input.signedName, 120), employee_signed_at: new Date().toISOString() })
      .eq("id", meetingId);
    await event(admin, g.c, context.userId, "The employee signed the minutes as accurate.");
  }
  done(g.c);
  return { ok: true };
}

// ─── Invites, outcome, appeal ───────────────────────────────────────────────

/**
 * Set the hearing (disciplinary) or meeting (grievance) and start the
 * invitation, which carries the right to be accompanied. The company's notice
 * period is the minimum unless the employee agreed to sooner.
 */
export async function inviteAction(
  id: string,
  input: { on: string; time: string; place: string; details: string; possibleOutcome: string; shorterAgreed: boolean },
): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c, person } = g;
  if (!ISO.test(input.on)) return { ok: false, error: "Set the date." };
  const s = await caseSettings(admin, context.organisationId!);
  if (!enoughNotice(input.on, today(), s.hearingNoticeDays) && !input.shorterAgreed) {
    return { ok: false, error: `That's less than ${s.hearingNoticeDays} days' notice. Choose a later date, or tick that they agreed to sooner.` };
  }
  const details = text(input.details, 6000);
  if (!details) return { ok: false, error: c.kind === "grievance" ? "Say what the meeting is about." : "Set out the allegations: they go in the letter." };
  const grievance = c.kind === "grievance";
  await admin
    .from("hr_cases")
    .update({ hearing_on: input.on, hearing_time: line(input.time, 40) || null, hearing_place: line(input.place, 200) || null, invited_on: today(), stage: grievance ? "meeting" : "hearing" })
    .eq("id", id);
  await event(admin, c, context.userId, `${grievance ? "Meeting" : "Hearing"} set for ${ukDate(input.on)}; the invitation drafted.`);
  const letter = await createLetterDraft(admin, {
    orgId: context.organisationId!,
    person,
    kind: grievance ? "grievance_meeting_invite" : "case_hearing_invite",
    sourceType: "case",
    sourceId: id,
    values: {
      date: ukDate(input.on),
      time: line(input.time, 40),
      place: line(input.place, 200),
      details,
      process: processOf(c),
      reason: line(input.possibleOutcome, 120) || "a formal warning",
    },
    by: context.userId,
  });
  done(c);
  return { ok: true, letterId: letter.id };
}

export async function acknowledgeGrievanceAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c, person } = g;
  if (c.kind !== "grievance") return { ok: false, error: "Only a grievance is acknowledged." };
  await admin.from("hr_cases").update({ stage: c.stage === "raised" ? "acknowledged" : c.stage }).eq("id", id);
  await event(admin, c, context.userId, "Acknowledgement drafted.");
  const letter = await createLetterDraft(admin, {
    orgId: context.organisationId!,
    person,
    kind: "grievance_ack",
    sourceType: "case",
    sourceId: id,
    values: { date: ukDate(c.raised_on as string) },
    by: context.userId,
  });
  done(c);
  return { ok: true, letterId: letter.id };
}

export async function outcomeAction(id: string, input: { outcome: string; notes: string; warningMonths: number | null }): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c, person } = g;
  const grievance = c.kind === "grievance";
  const allowed = grievance ? ["upheld", "partly_upheld", "not_upheld"] : ["no_action", "first_written", "final_written", "dismissal"];
  if (!allowed.includes(input.outcome)) return { ok: false, error: "Choose the outcome." };
  const notes = text(input.notes, 6000);
  if (!notes) return { ok: false, error: "Write the reasons: they go in the letter." };
  if (c.outcome) return { ok: false, error: "The outcome has been decided. An appeal is the way to change it." };
  const s = await caseSettings(admin, context.organisationId!);
  const on = today();
  const months = input.warningMonths && input.warningMonths >= 1 && input.warningMonths <= 36 ? Math.round(input.warningMonths) : null;
  const expires = warningExpiry(input.outcome, on, s, months);
  await admin
    .from("hr_cases")
    .update({ outcome: input.outcome, outcome_on: on, outcome_notes: notes, decided_by: context.userId, warning_expires_on: expires, stage: "outcome" })
    .eq("id", id);
  await event(admin, c, context.userId, `Outcome: ${outcomeLabel(input.outcome)}${expires ? `, active until ${ukDate(expires)}` : ""}.`);
  // The day it was actually held, from its minutes, before the date it was set for.
  const { data: held } = await admin
    .from("hr_case_meetings")
    .select("held_on")
    .eq("case_id", id)
    .in("kind", ["hearing", "meeting"])
    .order("held_on", { ascending: false })
    .limit(1);
  const heldOn = (held?.[0]?.held_on as string | undefined) ?? (c.hearing_on as string | null) ?? on;
  const kind = grievance
    ? "grievance_outcome"
    : input.outcome === "dismissal"
      ? "case_outcome_dismissal"
      : input.outcome === "no_action"
        ? "case_outcome_no_action"
        : "case_outcome_warning";
  const letter = await createLetterDraft(admin, {
    orgId: context.organisationId!,
    person,
    kind,
    sourceType: "case",
    sourceId: id,
    values: {
      date: ukDate(heldOn),
      details: notes,
      process: processOf(c),
      reason: outcomeLabel(input.outcome).toLowerCase(),
      months: expires ? monthsText(months ?? (input.outcome === "final_written" ? s.warningFinalMonths : s.warningFirstMonths)) : "",
      deadline: ukDate(addDays(on, s.appealDays)),
    },
    by: context.userId,
  });
  await logAudit({ context, action: "hr.case_outcome", entity: "hr_case", entityId: id, detail: { outcome: input.outcome } });
  done(c);
  return { ok: true, letterId: letter.id };
}

/** An appeal received: heard by a different manager. */
export async function appealAction(id: string, input: { receivedOn: string; grounds: string; managerId: string; hearingOn: string; time: string; place: string }): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c, person } = g;
  if (!appealable(c as never)) return { ok: false, error: "There's no outcome to appeal." };
  if (!ISO.test(input.receivedOn)) return { ok: false, error: "When did the appeal come in?" };
  const grounds = text(input.grounds, 6000);
  if (!grounds) return { ok: false, error: "Write their grounds of appeal." };
  const manager = await hrPerson(admin, context.organisationId, input.managerId);
  if (!manager || manager.role !== "org_admin") return { ok: false, error: "Choose the manager who will hear it." };
  if (manager.id === c.decided_by && !(await onlyManager(admin, context.organisationId!))) {
    return { ok: false, error: "The appeal is heard by a different manager from the one who decided." };
  }
  if (manager.id === c.user_id || manager.id === c.about_user_id) return { ok: false, error: "They can't hear an appeal about themselves." };
  if (input.hearingOn && !ISO.test(input.hearingOn)) return { ok: false, error: "Check the hearing date." };
  await admin
    .from("hr_cases")
    .update({ appeal_received_on: input.receivedOn, appeal_grounds: grounds, appeal_manager_id: manager.id, appeal_hearing_on: input.hearingOn || null, stage: "appeal" })
    .eq("id", id);
  await event(admin, c, context.userId, `Appeal received ${ukDate(input.receivedOn)}; to be heard by ${personName(manager)}.`);
  let letterId: string | undefined;
  if (input.hearingOn && c.kind === "disciplinary") {
    letterId = (
      await createLetterDraft(admin, {
        orgId: context.organisationId!,
        person,
        kind: "case_appeal_invite",
        sourceType: "case",
        sourceId: id,
        values: { date: ukDate(input.hearingOn), time: line(input.time, 40), place: line(input.place, 200), details: grounds, managerName: personName(manager) },
        by: context.userId,
      })
    ).id;
  }
  done(c);
  return { ok: true, letterId };
}

/** A company with one manager can't send the appeal elsewhere: ACAS says "where possible". */
async function onlyManager(admin: Admin, orgId: string): Promise<boolean> {
  const { count } = await admin.from("users").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("role", "org_admin").eq("status", "active");
  return (count ?? 0) <= 1;
}

export async function appealOutcomeAction(id: string, input: { outcome: string; notes: string }): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c, person } = g;
  if (!c.appeal_received_on) return { ok: false, error: "Record the appeal first." };
  if (!["upheld", "not_upheld", "varied"].includes(input.outcome)) return { ok: false, error: "Choose the decision." };
  const notes = text(input.notes, 6000);
  if (!notes) return { ok: false, error: "Write the reasons: they go in the letter." };
  // An appeal that succeeds takes the warning off the file; one that varies it keeps the dates the manager sets on the case.
  await admin
    .from("hr_cases")
    .update({ appeal_outcome: input.outcome, appeal_outcome_notes: notes, appeal_decided_on: today(), ...(input.outcome === "upheld" ? { warning_expires_on: null } : {}) })
    .eq("id", id);
  await event(admin, c, context.userId, `Appeal decided: ${appealLabel(input.outcome)}.`);
  const letter = await createLetterDraft(admin, {
    orgId: context.organisationId!,
    person,
    kind: c.kind === "grievance" ? "grievance_appeal_outcome" : "case_appeal_outcome",
    sourceType: "case",
    sourceId: id,
    values: { reason: APPEAL_IN_LETTER[input.outcome], details: notes },
    by: context.userId,
  });
  done(c);
  return { ok: true, letterId: letter.id };
}

/** The legal reminders: the manager confirms each, the site files nothing. */
export async function legalAction(id: string, which: "dbs_referral" | "cqc_notice" | "la_notice", status: string, on: string): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  if (!["dbs_referral", "cqc_notice", "la_notice"].includes(which) || !["unknown", "needed", "not_needed", "done"].includes(status)) return { ok: false, error: "Not recognised." };
  if (status === "done" && !ISO.test(on)) return { ok: false, error: "When was it done?" };
  await g.admin.from("hr_cases").update({ [which]: status, [`${which}_on`]: status === "done" ? on : null }).eq("id", id);
  const what = which === "dbs_referral" ? "DBS barring referral" : which === "cqc_notice" ? "Telling CQC" : "Telling the local authority safeguarding team";
  await event(g.admin, g.c, context.userId, `${what}: ${status === "done" ? `done ${ukDate(on)}` : status === "needed" ? "needed" : status === "not_needed" ? "not needed" : "not decided"}.`);
  await logAudit({ context, action: "hr.case_legal", entity: "hr_case", entityId: id, detail: { which, status, on } });
  done(g.c);
  return { ok: true };
}

/** Correct or set a warning's end date (HR-PACK.md: the lengths are editable). */
export async function setWarningExpiryAction(id: string, on: string): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  if (g.c.outcome !== "first_written" && g.c.outcome !== "final_written") return { ok: false, error: "There's no warning on this case." };
  if (!ISO.test(on)) return { ok: false, error: "Check the date." };
  await g.admin.from("hr_cases").update({ warning_expires_on: on }).eq("id", id);
  await event(g.admin, g.c, context.userId, `Warning now active until ${ukDate(on)}.`);
  done(g.c);
  return { ok: true };
}

export async function closeCaseAction(id: string, note: string): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const { admin, c } = g;
  if (c.suspended_on && !c.suspension_ended_on) return { ok: false, error: "End the suspension first." };
  await admin.from("hr_cases").update({ stage: "closed", closed_on: today() }).eq("id", id);
  await event(admin, c, context.userId, `Case closed.${note.trim() ? ` ${text(note, 1000)}` : ""}`);
  await logAudit({ context, action: "hr.case_closed", entity: "hr_case", entityId: id });
  done(c);
  return { ok: true };
}

export async function reopenCaseAction(id: string): Promise<Result> {
  const context = await requireConsole();
  const g = await gate(context, id);
  if (!g) return NOT_FOUND;
  const stage = g.c.appeal_received_on ? "appeal" : g.c.outcome ? "outcome" : g.c.kind === "grievance" ? "acknowledged" : "investigation";
  await g.admin.from("hr_cases").update({ stage, closed_on: null }).eq("id", id);
  await event(g.admin, g.c, context.userId, "Case reopened.");
  done(g.c);
  return { ok: true };
}

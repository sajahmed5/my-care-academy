"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { type UserContext, requireConsole, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvite } from "@/lib/invites";
import { logAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/entitlements";
import { siteOrigin } from "@/lib/site-url";
import { emailApplicationLink, issueApplicationLink, newToken } from "@/lib/candidate-links";
import { inviteCandidate, makeCandidateStaff } from "@/lib/candidate-account";
import { unlockAttempt } from "@/lib/literacy-attempts";
import { overallScore, sanitiseInterview, validateInterview } from "@/lib/recruitment-interview";
import type { FieldError } from "@/lib/recruitment-application";
import { sendReferenceRequest } from "@/lib/reference-requests";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import {
  RECRUITMENT_STEPS,
  notReadyMessage,
  outstandingSteps,
  progress,
  settingsFromRow,
  type CandidateDocRecord,
  type RecruitmentSettings,
  type ResolvedStep,
} from "@/lib/recruitment";

/** Recruitment is a paid add-on; block if the org isn't entitled. */
async function assertRecruitment(context: UserContext): Promise<void> {
  await requireFeature(context, "recruitment.tracker");
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * One candidate, read as the service role but only if they're this
 * organisation's, with their steps and the company's settings — everything
 * progress() needs to say whether a step is open.
 */
async function loadCandidate(admin: Admin, candidateId: string, orgId: string) {
  const [{ data: candidate }, { data: docs }, { data: settingsRow }] = await Promise.all([
    admin
      .from("candidates")
      .select("id, full_name, email, organisation_id, status, dbs_conviction, user_id")
      .eq("id", candidateId)
      .maybeSingle(),
    admin
      .from("candidate_documents")
      .select("id, doc_type, file_path, expires_at, not_required, review_status, review_note, uploaded_by_candidate")
      .eq("candidate_id", candidateId),
    admin.from("recruitment_settings").select("*").eq("organisation_id", orgId).maybeSingle(),
  ]);
  if (!candidate || candidate.organisation_id !== orgId) return null;
  const settings = settingsFromRow(settingsRow);
  const stages = progress((docs ?? []) as CandidateDocRecord[], settings, { dbsConviction: candidate.dbs_conviction === true });
  return { candidate, docs: docs ?? [], settings, stages };
}

/** The step, if it applies to this candidate and isn't locked behind an earlier stage. */
function openStep(stages: ReturnType<typeof progress>, key: string): ResolvedStep | string {
  const step = stages.flatMap((s) => s.steps).find((s) => s.key === key);
  if (!step) return "That step doesn't apply to this candidate.";
  if (step.locked) return "Finish the stage before this one first. Your company does the stages in order.";
  return step;
}

function done(candidateId: string) {
  revalidatePath(`/org/recruitment/${candidateId}`);
  revalidatePath("/org/recruitment");
}

export async function addCandidateAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Name is required." };
  const text = (key: string) => String(formData.get(key) ?? "").trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .insert({
      organisation_id: context.organisationId,
      full_name,
      email: text("email"),
      phone: text("phone"),
      postcode: text("postcode"),
      role_applied: text("role_applied"),
      source: text("source"),
      is_driver: formData.get("is_driver") === "on",
    })
    .select("id")
    .single();
  if (error || !data) return { error: "The candidate couldn't be added. Try again." };

  redirect(`/org/recruitment/${data.id}`);
}

/**
 * The office uploads a step's paper copy, or the file itself. An office
 * upload is confirmed as it lands: the office is the one checking it.
 */
export async function uploadDocumentAction(
  candidateId: string,
  docType: string,
  file: { name: string; dataUrl: string },
  expiresAt: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const step = openStep(loaded.stages, docType);
  if (typeof step === "string") return { ok: false, error: step };

  const base64 = file.dataUrl.split(",")[1] ?? "";
  const buffer = Buffer.from(base64, "base64");
  const path = `${context.organisationId}/${candidateId}/${docType}-${crypto.randomUUID()}-${file.name}`;
  const { error: upErr } = await admin.storage.from("candidate-docs").upload(path, buffer, { upsert: true });
  if (upErr) return { ok: false, error: "The file couldn't be uploaded. Try again." };

  const previous = loaded.docs.find((d) => d.doc_type === docType);
  const { error } = await admin.from("candidate_documents").upsert(
    {
      candidate_id: candidateId,
      organisation_id: context.organisationId,
      doc_type: docType,
      file_path: path,
      file_name: file.name,
      expires_at: expiresAt || null,
      not_required: false,
      not_required_reason: null,
      review_status: "confirmed",
      review_note: null,
      uploaded_by_candidate: false,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: "candidate_id,doc_type" },
  );
  if (error) {
    await admin.storage.from("candidate-docs").remove([path]);
    return { ok: false, error: "The file couldn't be saved. Try again." };
  }
  // The file it replaced goes too: an old passport kept for no reason is data we should not hold.
  if (previous?.file_path && previous.file_path !== path) {
    await admin.storage.from("candidate-docs").remove([previous.file_path as string]);
  }
  done(candidateId);
  return { ok: true };
}

/**
 * Confirm a step: one the candidate sent in, or one done on paper and held in
 * the office (a note says where). Nothing is uploaded.
 */
export async function confirmStepAction(
  candidateId: string,
  docType: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const step = openStep(loaded.stages, docType);
  if (typeof step === "string") return { ok: false, error: step };

  const existing = loaded.docs.find((d) => d.doc_type === docType);
  const trimmed = note.trim().slice(0, 500) || null;
  const { error } = existing
    ? await admin
        .from("candidate_documents")
        // Confirming keeps what's on the step (an online score, say) unless a note replaces it.
        .update({ review_status: "confirmed", review_note: trimmed ?? existing.review_note ?? null, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
        .eq("id", existing.id as string)
    : await admin.from("candidate_documents").insert({
        candidate_id: candidateId,
        organisation_id: context.organisationId,
        doc_type: docType,
        file_path: null,
        review_status: "confirmed",
        review_note: trimmed,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      });
  if (error) return { ok: false, error: "That couldn't be saved. Try again." };
  await logAudit({ context, action: "candidate.step_confirmed", entity: "candidate", entityId: candidateId, detail: { step: docType, note: trimmed } });
  done(candidateId);
  return { ok: true };
}

/** Send a candidate's upload back, with a note saying what's wrong. */
export async function sendBackStepAction(
  candidateId: string,
  docType: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const trimmed = note.trim().slice(0, 500);
  if (!trimmed) return { ok: false, error: "Say what needs changing, so they know what to send." };
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const existing = loaded.docs.find((d) => d.doc_type === docType);
  if (!existing || existing.review_status !== "submitted") return { ok: false, error: "There's nothing from the candidate to send back." };
  await admin
    .from("candidate_documents")
    .update({ review_status: "sent_back", review_note: trimmed, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
    .eq("id", existing.id as string);
  // A document they uploaded: tell them, with a way back to their page.
  // (A reference came from the referee, not the candidate: they aren't emailed about it.)
  if (existing.uploaded_by_candidate && docType !== "application" && !docType.startsWith("reference_") && loaded.candidate.email) {
    const company = await orgName(admin, context.organisationId!);
    const url = `${await siteOrigin()}/my-application`;
    await sendEmail({
      to: loaded.candidate.email as string,
      subject: `${company} needs something changed on your application`,
      html: emailLayout({
        heading: "Something to send again",
        body: `<p>${esc(company)} has looked at what you sent for <strong>${esc(stepLabel(docType))}</strong> and asked:</p>
          <p><em>${esc(trimmed)}</em></p>
          <p>Sign in to send it again.</p>${emailButton(url, "Open my application")}`,
        footer: `Sent for ${esc(company)} by My Care Academy.`,
      }),
    });
  }
  // An online application goes back to them to change, with the note, by email.
  if (docType === "application") {
    const { data: app } = await admin
      .from("candidate_applications")
      .update({ status: "draft", office_note: trimmed })
      .eq("candidate_id", candidateId)
      .select("id")
      .maybeSingle();
    if (app && loaded.candidate.email) {
      const link = await issueApplicationLink(admin, app.id as string);
      await emailApplicationLink({ to: loaded.candidate.email as string, firstName: null, company: await orgName(admin, context.organisationId!), link, note: trimmed });
    }
  }
  done(candidateId);
  return { ok: true };
}

function stepLabel(key: string): string {
  return RECRUITMENT_STEPS.find((s) => s.key === key)?.label ?? key;
}

/**
 * Unlock the literacy test: a QR code to scan here in the office (15 minutes
 * to start), or a link by email to take it at home (3 days). A retake only
 * when the office asks for one.
 */
export async function unlockLiteracyAction(
  candidateId: string,
  mode: "office" | "remote",
  retake: boolean,
): Promise<{ ok: boolean; link?: string; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const step = openStep(loaded.stages, "literacy");
  if (typeof step === "string") return { ok: false, error: step };
  const email = loaded.candidate.email as string | null;
  if (mode === "remote" && !email) return { ok: false, error: "Add their email address first, or run the test here in the office." };
  const r = await unlockAttempt(admin, { candidateId, orgId: context.organisationId!, mode, by: context.userId, retake });
  if ("error" in r) return { ok: false, error: r.error };
  if (retake) {
    // A retake puts the step back to not started until the new result is in.
    await admin.from("candidate_documents").delete().eq("candidate_id", candidateId).eq("doc_type", "literacy").is("file_path", null);
  }
  if (mode === "remote") {
    const company = await orgName(admin, context.organisationId!);
    const sent = await sendEmail({
      to: email!,
      subject: `Your reading and writing test for ${company}`,
      html: emailLayout({
        heading: "Your reading and writing test",
        body: `<p>${esc(company)} has sent you a short reading and writing test: about everyday things a carer reads and writes.</p>
          <p>It takes 20 minutes, and the clock starts when you press Begin, so open it when you have the time free.</p>
          ${emailButton(r.link, "Open the test")}
          <p>The link works for 3 days.</p>`,
        footer: `Sent for ${esc(company)} by My Care Academy.`,
      }),
    });
    if (!sent) return { ok: false, error: "The email couldn't be sent. Try again." };
  }
  await logAudit({ context, action: "candidate.literacy_unlocked", entity: "candidate", entityId: candidateId, detail: { mode, retake } });
  done(candidateId);
  return { ok: true, link: mode === "office" ? r.link : undefined };
}

/** Give a candidate a login to follow their application, by email. */
export async function inviteCandidateAction(candidateId: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const r = await inviteCandidate(admin, candidateId);
  if (!r.ok) return r;
  await logAudit({ context, action: "candidate.login_sent", entity: "candidate", entityId: candidateId });
  done(candidateId);
  return { ok: true };
}

async function orgName(admin: Admin, orgId: string): Promise<string> {
  const { data } = await admin.from("organisations").select("name").eq("id", orgId).maybeSingle();
  return (data?.name as string | undefined) ?? "the company";
}

/**
 * The company's apply link, for job adverts: made the first time it's asked
 * for, and the same link from then on.
 */
export async function getApplyLinkAction(): Promise<{ link?: string; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const { data } = await admin.from("recruitment_settings").select("apply_token").eq("organisation_id", context.organisationId!).maybeSingle();
  let token = data?.apply_token as string | null | undefined;
  if (!token) {
    token = newToken();
    const { error } = await admin
      .from("recruitment_settings")
      .upsert({ organisation_id: context.organisationId, apply_token: token }, { onConflict: "organisation_id" });
    if (error) return { error: "The link couldn't be made. Try again." };
  }
  return { link: `${await siteOrigin()}/apply/${token}` };
}

/** Email a candidate the online application form (a new link each time). */
export async function sendApplicationFormAction(candidateId: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const email = loaded.candidate.email as string | null;
  if (!email) return { ok: false, error: "Add their email address first." };
  const { data: existing } = await admin.from("candidate_applications").select("id, status").eq("candidate_id", candidateId).maybeSingle();
  if (existing?.status === "submitted") return { ok: false, error: "They've already sent their application." };
  let id = existing?.id as string | undefined;
  if (!id) {
    const [first, ...rest] = String(loaded.candidate.full_name ?? "").split(" ");
    const { data } = await admin
      .from("candidate_applications")
      .insert({ organisation_id: context.organisationId, candidate_id: candidateId, answers: { firstName: first, surname: rest.join(" "), email } })
      .select("id")
      .single();
    id = data?.id as string | undefined;
  }
  if (!id) return { ok: false, error: "The form couldn't be sent. Try again." };
  const link = await issueApplicationLink(admin, id);
  const sent = await emailApplicationLink({ to: email, firstName: null, company: await orgName(admin, context.organisationId!), link });
  if (!sent) return { ok: false, error: "The email couldn't be sent. Try again." };
  await logAudit({ context, action: "candidate.application_sent", entity: "candidate", entityId: candidateId });
  done(candidateId);
  return { ok: true };
}

/**
 * Record that a step doesn't apply to this candidate — a share code for
 * someone with a UK passport, say. It counts as done for the hire, so it is
 * attributed in the audit trail with the reason given. A file already held
 * has to be removed first: silently discarding a DBS is not a tidy-up.
 */
export async function markDocumentNotRequiredAction(
  candidateId: string,
  docType: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  if (!RECRUITMENT_STEPS.some((d) => d.key === docType)) return { ok: false, error: "Unknown step." };
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  if (loaded.docs.find((d) => d.doc_type === docType)?.file_path) {
    return { ok: false, error: "A file is held for this. Remove it first." };
  }
  const trimmed = reason.trim();
  const { error } = await admin.from("candidate_documents").upsert(
    {
      candidate_id: candidateId,
      organisation_id: context.organisationId,
      doc_type: docType,
      file_path: null,
      file_name: null,
      expires_at: null,
      not_required: true,
      not_required_reason: trimmed || null,
      review_status: "confirmed",
      review_note: null,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: "candidate_id,doc_type" },
  );
  if (error) return { ok: false, error: "That couldn't be saved. Try again." };
  await logAudit({ context, action: "candidate.document_not_required", entity: "candidate", entityId: candidateId, detail: { doc_type: docType, reason: trimmed || null } });
  done(candidateId);
  return { ok: true };
}

/** Undo a step: the file it holds, a "done on paper", or a "not needed". */
export async function deleteDocumentAction(docId: string, candidateId: string): Promise<{ ok: boolean }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("candidate_documents")
    .select("file_path, organisation_id")
    .eq("id", docId)
    .maybeSingle();
  if (doc && doc.organisation_id === context.organisationId) {
    if (doc.file_path) await admin.storage.from("candidate-docs").remove([doc.file_path]);
    await admin.from("candidate_documents").delete().eq("id", docId);
  }
  done(candidateId);
  return { ok: true };
}

export async function getDocUrlAction(path: string): Promise<{ url?: string }> {
  const context = await requireConsole();
  if (!path.startsWith(`${context.organisationId}/`)) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage.from("candidate-docs").createSignedUrl(path, 60);
  return { url: data?.signedUrl };
}

/** The DBS shows a conviction: the DBS risk assessment step joins stage 3. */
export async function setDbsConvictionAction(candidateId: string, conviction: boolean): Promise<{ ok: boolean }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const supabase = await createClient();
  await supabase.from("candidates").update({ dbs_conviction: conviction }).eq("id", candidateId);
  await logAudit({ context, action: "candidate.dbs_conviction", entity: "candidate", entityId: candidateId, detail: { conviction } });
  done(candidateId);
  return { ok: true };
}

/** Not taking a candidate forward, or bringing them back. */
export async function setCandidateOutcomeAction(
  candidateId: string,
  outcome: "rejected" | "candidate",
): Promise<{ ok: boolean }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const supabase = await createClient();
  await supabase
    .from("candidates")
    .update({ status: outcome, rejected_at: outcome === "rejected" ? new Date().toISOString() : null })
    .eq("id", candidateId)
    .neq("status", "hired");
  await logAudit({ context, action: outcome === "rejected" ? "candidate.rejected" : "candidate.reopened", entity: "candidate", entityId: candidateId });
  done(candidateId);
  return { ok: true };
}

/**
 * Delete a candidate, and every file uploaded for them (#59). The document
 * rows cascade with the candidate, but the files in the bucket do not — left
 * behind, a passport or DBS sits there with nothing pointing at it.
 */
export async function deleteCandidateAction(id: string): Promise<void> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const { data: candidate } = await admin
    .from("candidates")
    .select("full_name, status, organisation_id")
    .eq("id", id)
    .maybeSingle();
  if (!candidate || candidate.organisation_id !== context.organisationId) redirect("/org/recruitment");

  const folder = `${context.organisationId}/${id}`;
  const { data: files } = await admin.storage.from("candidate-docs").list(folder, { limit: 1000 });
  if (files?.length) {
    await admin.storage.from("candidate-docs").remove(files.map((f) => `${folder}/${f.name}`));
  }
  await admin.from("candidates").delete().eq("id", id);
  await logAudit({
    context,
    action: "candidate.deleted",
    entity: "candidate",
    entityId: id,
    detail: { name: candidate.full_name, status: candidate.status, files_removed: files?.length ?? 0 },
  });
  revalidatePath("/org/recruitment");
  redirect("/org/recruitment");
}

/**
 * Hire; optionally create the candidate as a learner. Refused while any
 * required step is outstanding: the button is disabled for the same reason,
 * but the button is not the gate.
 */
export async function hireCandidateAction(
  candidateId: string,
  createLearner: boolean,
): Promise<{ ok: boolean; invited?: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const outstanding = outstandingSteps(loaded.stages, loaded.settings);
  if (outstanding.length > 0) return { ok: false, error: notReadyMessage(outstanding) };

  await admin.from("candidates").update({ status: "hired", hired_at: new Date().toISOString() }).eq("id", candidateId);

  let invited = false;
  const { candidate } = loaded;
  // Their candidate login becomes their training login, if they have one.
  if (createLearner && (await makeCandidateStaff(admin, candidateId, context.organisationId!))) {
    invited = true;
  } else if (createLearner && candidate.email) {
    const result = await createInvite({
      email: candidate.email as string,
      role: "learner",
      organisationId: context.organisationId!,
      fullName: candidate.full_name as string,
      roleLabel: "learner",
    });
    invited = !!result.userId;
  }

  await logAudit({ context, action: "candidate.hired", entity: "candidate", entityId: candidateId, detail: { created_learner: invited } });
  done(candidateId);
  return { ok: true, invited };
}

/** The company's recruitment settings. Managers only. */
export async function saveRecruitmentSettingsAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const context = await requireRole("org_admin");
  await assertRecruitment(context);
  const switchable = RECRUITMENT_STEPS.filter((s) => s.canSwitchOff).map((s) => s.key);
  const settings: RecruitmentSettings = {
    stagesInOrder: formData.get("stages_in_order") === "on",
    stepsOff: switchable.filter((k) => formData.get(`step_${k}`) !== "on"),
    thirdReference: formData.get("third_reference") === "on",
    dbsBeforeStart: formData.get("dbs_before_start") === "on",
  };
  const supabase = await createClient();
  const { error } = await supabase.from("recruitment_settings").upsert({
    organisation_id: context.organisationId,
    stages_in_order: settings.stagesInOrder,
    steps_off: settings.stepsOff,
    third_reference: settings.thirdReference,
    dbs_before_start: settings.dbsBeforeStart,
    updated_by: context.userId,
  });
  if (error) return { error: "The settings couldn't be saved. Try again." };
  await logAudit({ context, action: "recruitment.settings_saved", entity: "organisation", entityId: context.organisationId!, detail: { ...settings } });
  revalidatePath("/org/recruitment", "layout");
  return { ok: true };
}

/**
 * The interview record: saved as the interview runs, finished with one
 * overall score and an outcome, which confirms the Interview step with the
 * score on it. The candidate never sees it.
 */
export async function saveInterviewAction(
  candidateId: string,
  raw: unknown,
  finish: boolean,
): Promise<{ ok: boolean; error?: string; problems?: Record<string, FieldError[]> }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const step = openStep(loaded.stages, "interview");
  if (typeof step === "string") return { ok: false, error: step };
  const answers = sanitiseInterview(raw);
  if (finish) {
    const problems = validateInterview(answers, new Date().toISOString().slice(0, 10));
    if (Object.keys(problems).length) return { ok: false, error: "Some answers still need filling in.", problems };
  }
  const score = overallScore(answers);
  const outcome = typeof answers.outcome === "string" ? answers.outcome : null;
  const { error } = await admin.from("candidate_interviews").upsert(
    {
      organisation_id: context.organisationId,
      candidate_id: candidateId,
      answers,
      status: finish ? "complete" : "draft",
      overall_score: score,
      outcome,
      completed_at: finish ? new Date().toISOString() : null,
      updated_by: context.userId,
    },
    { onConflict: "candidate_id" },
  );
  if (error) return { ok: false, error: "The interview couldn't be saved. Try again." };
  if (finish) {
    await admin.from("candidate_documents").upsert(
      {
        candidate_id: candidateId,
        organisation_id: context.organisationId,
        doc_type: "interview",
        file_path: null,
        not_required: false,
        review_status: "confirmed",
        review_note: `Scored ${score} of 5 · ${outcome}`,
        uploaded_by_candidate: false,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      },
      { onConflict: "candidate_id,doc_type" },
    );
    await logAudit({ context, action: "candidate.interviewed", entity: "candidate", entityId: candidateId, detail: { score, outcome } });
  }
  done(candidateId);
  return { ok: true };
}

/** Ask a referee for their reference by email (a new link each time). */
export async function sendReferenceRequestAction(candidateId: string, referenceId: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { ok: false, error: "Candidate not found." };
  const { data: ref } = await admin.from("candidate_references").select("candidate_id, email, status, position").eq("id", referenceId).maybeSingle();
  if (!ref || ref.candidate_id !== candidateId) return { ok: false, error: "Referee not found." };
  if (!ref.email) return { ok: false, error: "Add the referee's email address first." };
  if (ref.status === "received") return { ok: false, error: "Their reference is already in." };
  const step = openStep(loaded.stages, `reference_${ref.position}`);
  if (typeof step === "string") return { ok: false, error: step };
  const sent = await sendReferenceRequest(admin, referenceId, context.userId, false);
  if (!sent) return { ok: false, error: "The email couldn't be sent. Try again." };
  await logAudit({ context, action: "candidate.reference_requested", entity: "candidate", entityId: candidateId, detail: { position: ref.position } });
  done(candidateId);
  return { ok: true };
}

/** Add a referee by hand, or correct one: the office's details stand. */
export async function saveRefereeAction(
  candidateId: string,
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const context = await requireConsole();
  await assertRecruitment(context);
  const admin = createAdminClient();
  const loaded = await loadCandidate(admin, candidateId, context.organisationId!);
  if (!loaded) return { error: "Candidate not found." };
  const position = Number(formData.get("position"));
  if (![1, 2, 3].includes(position)) return { error: "Choose which reference this is." };
  const text = (k: string) => String(formData.get(k) ?? "").trim().slice(0, 200) || null;
  const name = text("referee_name");
  if (!name) return { error: "Give the referee's name." };
  const { error } = await admin.from("candidate_references").upsert(
    {
      organisation_id: context.organisationId,
      candidate_id: candidateId,
      position,
      referee_type: formData.get("referee_type") === "Previous employer" ? "Previous employer" : "Character reference",
      referee_name: name,
      email: text("email")?.toLowerCase() ?? null,
      phone: text("phone"),
      organisation: text("organisation"),
    },
    { onConflict: "candidate_id,position" },
  );
  if (error) return { error: "The referee couldn't be saved. Try again." };
  done(candidateId);
  return { ok: true };
}

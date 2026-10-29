"use server";

import { revalidatePath } from "next/cache";
import { requireConsole, type UserContext } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { askClaudeJson } from "@/lib/ai";
import { inviteCandidate } from "@/lib/candidate-account";
import { progress, settingsFromRow, type CandidateDocRecord } from "@/lib/recruitment";
import type { Answers } from "@/lib/recruitment-application";
import {
  OFFER_DRAFT_SCHEMA,
  buildOffer,
  buildRejection,
  evidenceIsThin,
  letterHtml,
  offerEvidence,
  offerProblems,
  offerPrompt,
  rejectionProblems,
  rejectionSummary,
  sanitiseOffer,
  sanitiseRejection,
} from "@/lib/recruitment-letters";

/**
 * The offer and rejection letters (RECRUITMENT.md, release 5). A person
 * always reads, edits and sends a letter; AI only drafts "why we chose you",
 * and only when the company has switched it on.
 */

type Admin = ReturnType<typeof createAdminClient>;
type Result = { ok: boolean; error?: string; message?: string };
const today = () => new Date().toISOString().slice(0, 10);

async function load(admin: Admin, context: UserContext, candidateId: string) {
  const { data: c } = await admin
    .from("candidates")
    .select("id, full_name, email, organisation_id, status, role_applied, dbs_conviction, user_id, organisations(name)")
    .eq("id", candidateId)
    .maybeSingle();
  if (!c || c.organisation_id !== context.organisationId) return null;
  return { ...c, company: (c.organisations as unknown as { name: string } | null)?.name ?? "" };
}

function done(candidateId: string) {
  revalidatePath(`/org/recruitment/${candidateId}`);
  revalidatePath("/org/recruitment");
}

/** Keep the wording between visits, so a half-written letter isn't lost. */
export async function saveLetterDraftAction(candidateId: string, kind: "offer" | "rejection", raw: unknown): Promise<Result> {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const admin = createAdminClient();
  const c = await load(admin, context, candidateId);
  if (!c) return { ok: false, error: "Candidate not found." };
  const fields = kind === "offer" ? sanitiseOffer(raw) : sanitiseRejection(raw);
  const { error } = await admin
    .from("candidate_letters")
    .upsert({ candidate_id: candidateId, organisation_id: c.organisation_id, kind, fields, updated_by: context.userId }, { onConflict: "candidate_id,kind" });
  return error ? { ok: false, error: "The draft couldn't be saved." } : { ok: true };
}

/**
 * "Why we chose you", drafted by Claude from the interview's values notes
 * and the candidate's own application, for the office to edit.
 */
export async function draftWhyHiredAction(candidateId: string, position: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const admin = createAdminClient();
  const c = await load(admin, context, candidateId);
  if (!c) return { ok: false, error: "Candidate not found." };
  const [{ data: interview }, { data: app }] = await Promise.all([
    admin.from("candidate_interviews").select("answers, status, outcome").eq("candidate_id", candidateId).maybeSingle(),
    admin.from("candidate_applications").select("answers, status").eq("candidate_id", candidateId).maybeSingle(),
  ]);
  if (interview?.status !== "complete") return { ok: false, error: "Finish the interview record first: the draft is written from its notes." };
  const evidence = offerEvidence(interview.answers as Answers, app?.status === "submitted" ? (app.answers as Answers) : null);
  if (evidenceIsThin(evidence)) {
    return { ok: false, error: "There aren't enough notes on the values questions to write from. Add what they said to the interview record, or write this part yourself." };
  }
  const r = await askClaudeJson<{ paragraphs: string[] }>({
    orgId: c.organisation_id as string,
    userId: context.userId,
    feature: "offer_letter",
    prompt: offerPrompt({
      firstName: String(c.full_name).trim().split(/\s+/)[0],
      companyName: c.company,
      position: position.trim() || "Carer",
      evidence,
    }),
    schema: OFFER_DRAFT_SCHEMA,
  });
  if (!r.ok) return r;
  const text = (r.data.paragraphs ?? []).map((p) => String(p).trim()).filter(Boolean).join("\n\n");
  if (!text) return { ok: false, error: "The draft came back empty. Try again, or write it yourself." };
  await logAudit({ context, action: "candidate.offer_drafted_ai", entity: "candidate", entityId: candidateId });
  return { ok: true, text };
}

/**
 * Send the conditional offer: emailed from the company, kept as sent, and the
 * Conditional offer step confirmed — which opens stage 3. A candidate without
 * a login is given one, so they can fill in the health form and upload.
 */
export async function sendOfferAction(candidateId: string, raw: unknown): Promise<Result> {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const admin = createAdminClient();
  const c = await load(admin, context, candidateId);
  if (!c) return { ok: false, error: "Candidate not found." };
  if (c.status !== "candidate") return { ok: false, error: "They're no longer a candidate." };
  if (!c.email) return { ok: false, error: "Add their email address first, or send the letter on paper and mark the step held on paper." };
  const fields = sanitiseOffer(raw);
  const problems = offerProblems(fields);
  if (problems.length) return { ok: false, error: problems.join(" ") };

  const [{ data: docs }, { data: settingsRow }] = await Promise.all([
    admin.from("candidate_documents").select("doc_type, file_path, expires_at, not_required, review_status").eq("candidate_id", candidateId),
    admin.from("recruitment_settings").select("*").eq("organisation_id", c.organisation_id as string).maybeSingle(),
  ]);
  const settings = settingsFromRow(settingsRow);
  const steps = progress((docs ?? []) as CandidateDocRecord[], settings, { dbsConviction: c.dbs_conviction === true }).flatMap((s) => s.steps);
  const offer = steps.find((s) => s.key === "offer");
  if (!offer || offer.locked) return { ok: false, error: "The offer opens once stage 1 is done." };
  if (steps.find((s) => s.key === "interview")?.state !== "confirmed") return { ok: false, error: "Confirm the interview before sending an offer." };

  const letter = buildOffer({
    fields,
    candidateName: c.full_name as string,
    companyName: c.company,
    referees: steps.some((s) => s.key === "reference_3" && s.required) ? 3 : 2,
    todayIso: today(),
  });
  const html = letterHtml(letter);
  const sent = await sendEmail({ to: c.email as string, subject: letter.subject, html, replyTo: context.email ?? undefined });
  if (!sent) return { ok: false, error: "The email couldn't be sent. Try again." };

  const now = new Date().toISOString();
  await admin.from("candidate_letters").upsert(
    { candidate_id: candidateId, organisation_id: c.organisation_id, kind: "offer", fields, sent_html: html, sent_to: c.email, sent_at: now, sent_by: context.userId, updated_by: context.userId },
    { onConflict: "candidate_id,kind" },
  );
  await admin.from("candidate_documents").upsert(
    {
      candidate_id: candidateId,
      organisation_id: c.organisation_id,
      doc_type: "offer",
      file_path: null,
      file_name: null,
      not_required: false,
      review_status: "confirmed",
      review_note: `Emailed ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
      uploaded_by_candidate: false,
      reviewed_by: context.userId,
      reviewed_at: now,
    },
    { onConflict: "candidate_id,doc_type" },
  );
  let message = "Offer sent.";
  if (!c.user_id) {
    const invited = await inviteCandidate(admin, candidateId);
    message = invited.ok ? "Offer sent, with a login to follow their application." : `Offer sent. Their login couldn't be sent: ${invited.error}`;
  }
  await logAudit({ context, action: "candidate.offer_sent", entity: "candidate", entityId: candidateId, detail: { position: fields.position } });
  done(candidateId);
  return { ok: true, message };
}

/**
 * Not taking them forward: closed, and the letter emailed if the office
 * chose to send one.
 */
export async function sendRejectionAction(candidateId: string, raw: unknown, sendLetter: boolean): Promise<Result> {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const admin = createAdminClient();
  const c = await load(admin, context, candidateId);
  if (!c) return { ok: false, error: "Candidate not found." };
  if (c.status === "hired") return { ok: false, error: "They've been hired." };
  const fields = sanitiseRejection(raw);
  let sentHtml: string | null = null;
  if (sendLetter) {
    if (!c.email) return { ok: false, error: "There's no email address for them. Close it without a letter." };
    const problems = rejectionProblems(fields);
    if (problems.length) return { ok: false, error: problems.join(" ") };
    const letter = buildRejection({ fields, candidateName: c.full_name as string, companyName: c.company, position: c.role_applied as string | null, todayIso: today() });
    sentHtml = letterHtml(letter);
    const sent = await sendEmail({ to: c.email as string, subject: letter.subject, html: sentHtml, replyTo: context.email ?? undefined });
    if (!sent) return { ok: false, error: "The email couldn't be sent. Try again." };
  }
  const now = new Date().toISOString();
  await admin.from("candidate_letters").upsert(
    {
      candidate_id: candidateId,
      organisation_id: c.organisation_id,
      kind: "rejection",
      fields,
      sent_html: sentHtml,
      sent_to: sentHtml ? c.email : null,
      sent_at: sentHtml ? now : null,
      sent_by: sentHtml ? context.userId : null,
      updated_by: context.userId,
    },
    { onConflict: "candidate_id,kind" },
  );
  await admin.from("candidates").update({ status: "rejected", rejected_at: now }).eq("id", candidateId).neq("status", "hired");
  await logAudit({
    context,
    action: "candidate.rejected",
    entity: "candidate",
    entityId: candidateId,
    detail: { letter: !!sentHtml, reasons: rejectionSummary(fields) },
  });
  done(candidateId);
  return { ok: true, message: sentHtml ? "Closed, and the letter has been sent." : "Closed without a letter." };
}

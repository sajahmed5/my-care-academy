"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { answerLines, cleanQuestions, questionsForRound, surveyKind } from "@/lib/feedback";
import { invitationEmail, sendInvitations } from "@/lib/feedback-email";
import { siteOrigin } from "@/lib/site-url";
import { createComplaintAction } from "@/app/org/complaints/actions";
import { UNTRIAGED } from "@/lib/complaints/stages";
import type { SaveState } from "@/app/platform/actions";

const NOT_IN_PLAN = "Feedback surveys are not included in your plan.";
const token = () => crypto.randomBytes(24).toString("base64url");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function console_() {
  const context = await requireConsole();
  return (await hasFeature(context, "quality.feedback")) ? context : null;
}

/**
 * Start a round (FORMS.md, "Rounds"): which survey, its name, whether a
 * client round is named, and when it closes. It is sent with the company's
 * wording as it stands now, kept on the round, so changing the wording later
 * never muddles these results. Staff rounds are always anonymous.
 */
export async function createSurveyAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await console_();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const kind = surveyKind(String(formData.get("kind") ?? ""));
  if (!kind) return { ok: false, error: "Pick who the survey is for." };
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const named = kind.key === "client" && String(formData.get("named") ?? "") === "1";
  const closesOn = String(formData.get("closesOn") ?? "");
  if (closesOn && !/^\d{4}-\d{2}-\d{2}$/.test(closesOn)) return { ok: false, error: "Give a real closing date." };

  const supabase = await createClient();
  const { data: wording } = await supabase
    .from("organisation_feedback_questions")
    .select("questions")
    .eq("organisation_id", context.organisationId!)
    .eq("kind", kind.key)
    .maybeSingle();
  const questions = cleanQuestions(wording?.questions) ?? kind.questions;

  const { data, error } = await supabase
    .from("feedback_surveys")
    .insert({
      organisation_id: context.organisationId,
      kind: kind.key,
      title: title || null,
      // The whole address of the open link: long and random, so it cannot be guessed.
      token: token(),
      questions,
      named,
      closes_on: closesOn || null,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "feedback.survey_created", entity: "feedback_survey", entityId: data.id as string, detail: { kind: kind.key, named } });
  revalidatePath("/org/feedback");
  redirect(`/org/feedback/${data.id}`);
}

/** Open or close a round. A closed round says so and takes no answers. */
export async function setSurveyOpenAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await console_();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = String(formData.get("id") ?? "");
  const open = formData.get("open") === "1";
  const supabase = await createClient();
  const { error } = await supabase.from("feedback_surveys").update({ is_open: open }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: open ? "feedback.survey_opened" : "feedback.survey_closed", entity: "feedback_survey", entityId: id });
  revalidatePath(`/org/feedback/${id}`);
  revalidatePath("/org/feedback");
  return { ok: true };
}

/** How many people were handed the open link or a printed QR code, for the response rate. */
export async function setSentToCountAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await console_();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("sentTo") ?? "").trim();
  const n = raw ? Number(raw) : null;
  if (n !== null && !(Number.isInteger(n) && n >= 0 && n <= 100000)) return { ok: false, error: "A whole number." };
  const supabase = await createClient();
  const { error } = await supabase.from("feedback_surveys").update({ sent_to_count: n }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/feedback/${id}`);
  return { ok: true };
}

/**
 * Email people their own link (FORMS.md, "Sent"). On a client round each
 * picked client's family gets one, at the address given; on a staff round,
 * each picked member of staff. Someone already sent a link on this round is
 * not sent a second.
 */
export async function sendRoundInvitationsAction(_prev: SaveState & { count?: number }, formData: FormData): Promise<SaveState & { count?: number }> {
  const context = await console_();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const orgId = context.organisationId!;
  const surveyId = String(formData.get("surveyId") ?? "");
  const supabase = await createClient();
  const { data: survey } = await supabase
    .from("feedback_surveys")
    .select("id, kind, title, named, is_open, closes_on, questions")
    .eq("id", surveyId)
    .maybeSingle();
  if (!survey) return { ok: false, error: "That round is no longer there." };
  if (!survey.is_open) return { ok: false, error: "Reopen the round before sending it." };
  const kind = surveyKind(survey.kind as string)!;

  const { data: already } = await supabase.from("feedback_invitations").select("client_id, user_id").eq("survey_id", surveyId).limit(5000);
  const sentClients = new Set((already ?? []).map((r) => r.client_id as string | null).filter(Boolean));
  const sentUsers = new Set((already ?? []).map((r) => r.user_id as string | null).filter(Boolean));

  type Pending = { client_id: string | null; user_id: string | null; name: string | null; email: string; clientName: string | null };
  const pending: Pending[] = [];
  if (kind.key === "client") {
    const picked = formData.getAll("clientId").map(String).filter((id) => id && !sentClients.has(id));
    if (picked.length === 0) return { ok: false, error: "Tick the clients whose families should get it." };
    const { data: clients } = await supabase.from("clients").select("id, full_name").in("id", picked.slice(0, 300));
    for (const c of clients ?? []) {
      const email = String(formData.get(`email_${c.id}`) ?? "").trim().toLowerCase();
      if (!email) continue;
      if (!EMAIL.test(email)) return { ok: false, error: `${c.full_name}: that email address does not look right.` };
      const name = String(formData.get(`name_${c.id}`) ?? "").trim().slice(0, 120) || null;
      pending.push({ client_id: c.id as string, user_id: null, name, email, clientName: c.full_name as string });
    }
    if (pending.length === 0) return { ok: false, error: "Give an email address for each client you ticked." };
  } else {
    const picked = formData.getAll("userId").map(String).filter((id) => id && !sentUsers.has(id));
    if (picked.length === 0) return { ok: false, error: "Tick who should get it." };
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .in("id", picked.slice(0, 1000));
    for (const u of users ?? []) {
      if (!u.email) continue;
      pending.push({ client_id: null, user_id: u.id as string, name: (u.full_name as string | null) ?? null, email: u.email as string, clientName: null });
    }
  }

  const rows = pending.map((p) => ({
    survey_id: surveyId,
    organisation_id: orgId,
    token: token(),
    client_id: p.client_id,
    user_id: p.user_id,
    name: p.name,
    email: p.email,
    created_by: context.userId,
  }));
  const { data: created, error } = await supabase.from("feedback_invitations").insert(rows).select("id, token, client_id, user_id");
  if (error) return { ok: false, error: error.message };

  const origin = await siteOrigin();
  const { data: org } = await supabase.from("organisations").select("name").eq("id", orgId).maybeSingle();
  const orgName = (org?.name as string) ?? "Your care provider";
  const roundTitle = (survey.title as string | null) || kind.label;
  const outgoing = (created ?? []).map((inv) => {
    const p = pending.find((x) => (x.client_id && x.client_id === inv.client_id) || (x.user_id && x.user_id === inv.user_id))!;
    const mail = invitationEmail({
      orgName,
      roundTitle,
      kind: kind.key,
      named: survey.named === true,
      name: p.name,
      clientName: p.clientName,
      url: `${origin}/survey/${inv.token}`,
      closesOn: (survey.closes_on as string | null) ?? null,
    });
    return { invitationId: inv.id as string, to: p.email, ...mail };
  });
  // Sent after the response, so a long list does not hold the click up.
  after(() => sendInvitations(createAdminClient(), orgId, outgoing));

  await logAudit({ context, action: "feedback.invitations_sent", entity: "feedback_survey", entityId: surveyId, detail: { count: outgoing.length } });
  revalidatePath(`/org/feedback/${surveyId}`);
  revalidatePath(`/org/feedback/${surveyId}/send`);
  return { ok: true, count: outgoing.length };
}

async function loadNamedResponse(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("feedback_responses")
    .select("id, survey_id, client_id, respondent_name, answers, submitted_at, complaint_id, compliment_id, survey:feedback_surveys (kind, title, questions)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const s = (Array.isArray(data.survey) ? data.survey[0] : data.survey) as { kind: string; title: string | null; questions: unknown };
  return { ...data, round: s, questions: questionsForRound(s) };
}

/**
 * A low score on a named round, raised as a concern in one click: a concern
 * about the client, not yet triaged, carrying what they said — opened for the
 * office to triage. The answer remembers the concern, so it is raised once.
 */
export async function raiseConcernFromFeedbackAction(formData: FormData): Promise<void> {
  const context = await console_();
  if (!context || !(await hasFeature(context, "complaints.register"))) redirect("/org/feedback");
  const supabase = await createClient();
  const r = await loadNamedResponse(supabase, String(formData.get("responseId") ?? ""));
  if (!r || !r.client_id) redirect("/org/feedback");
  if (r.complaint_id) redirect(`/org/complaints/${r.complaint_id}`);

  const lines = answerLines(r.questions, r.answers as Record<string, number | string>);
  const fd = new FormData();
  fd.set("kind", UNTRIAGED);
  fd.set("nature", "service");
  fd.set("clientId", r.client_id as string);
  fd.set("raisedByName", (r.respondent_name as string | null) ?? "");
  fd.set("reportedOn", new Date().toISOString().slice(0, 10));
  fd.set(
    "description",
    `Raised from the feedback survey “${r.round.title || "Client and family feedback"}”, answered ${new Date(r.submitted_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}:\n\n${lines.join("\n")}`,
  );
  fd.set("feedbackResponseId", r.id as string);
  await logAudit({ context, action: "feedback.concern_raised", entity: "feedback_response", entityId: r.id as string });
  // Saves the concern, links it back to this answer, and opens it.
  await createComplaintAction({}, fd);
}

/** Praise on a named round, logged as a compliment about the client in one click. */
export async function logComplimentFromFeedbackAction(formData: FormData): Promise<void> {
  const context = await console_();
  if (!context || !(await hasFeature(context, "complaints.register"))) redirect("/org/feedback");
  const supabase = await createClient();
  const r = await loadNamedResponse(supabase, String(formData.get("responseId") ?? ""));
  if (!r || !r.client_id) redirect("/org/feedback");
  if (!r.compliment_id) {
    const words = answerLines(r.questions, r.answers as Record<string, number | string>, { textOnly: true });
    const { data: c, error } = await supabase
      .from("compliments")
      .insert({
        organisation_id: context.organisationId,
        received_on: (r.submitted_at as string).slice(0, 10),
        from_name: (r.respondent_name as string | null) ?? null,
        from_role: "family",
        client_id: r.client_id,
        what_was_said: `From the feedback survey “${r.round.title || "Client and family feedback"}”: ${words.join(" ")}`.slice(0, 4000),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (!error && c) {
      await supabase.from("feedback_responses").update({ compliment_id: c.id }).eq("id", r.id as string);
      await logAudit({ context, action: "feedback.compliment_logged", entity: "feedback_response", entityId: r.id as string });
    }
  }
  revalidatePath(`/org/feedback/${r.survey_id}`);
  revalidatePath("/org/complaints/compliments");
}

/** Add a "you said, we did" line to a round. */
export async function saveFeedbackActionAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await console_();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const surveyId = String(formData.get("surveyId") ?? "");
  const id = String(formData.get("id") ?? "");
  const youSaid = String(formData.get("youSaid") ?? "").trim().slice(0, 1000);
  const weDid = String(formData.get("weDid") ?? "").trim().slice(0, 2000);
  if (!youSaid) return { ok: false, error: "Say what people said." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("feedback_actions").update({ you_said: youSaid, we_did: weDid || null }).eq("id", id)
    : await supabase.from("feedback_actions").insert({
        survey_id: surveyId,
        organisation_id: context.organisationId,
        you_said: youSaid,
        we_did: weDid || null,
        created_by: context.userId,
      });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/feedback/${surveyId}`);
  revalidatePath(`/org/feedback/${surveyId}/report`);
  return { ok: true };
}

export async function deleteFeedbackActionAction(formData: FormData): Promise<void> {
  const context = await console_();
  if (!context) return;
  const surveyId = String(formData.get("surveyId") ?? "");
  const supabase = await createClient();
  await supabase.from("feedback_actions").delete().eq("id", String(formData.get("id") ?? ""));
  revalidatePath(`/org/feedback/${surveyId}`);
}

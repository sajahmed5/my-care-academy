"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { rateLimit } from "@/lib/rate-limit";
import { applicationForToken, emailApplicationLink, issueApplicationLink } from "@/lib/candidate-links";
import { inviteCandidate } from "@/lib/candidate-account";
import {
  applicationSections,
  sanitiseAnswers,
  validateApplication,
  type Answers,
  type FieldError,
  type FormSection,
} from "@/lib/recruitment-application";
import { companyQuestions } from "@/lib/company-questions";
import { APPLICATION_CUSTOM_TITLE, customSection } from "@/lib/custom-questions";

type Admin = ReturnType<typeof createAdminClient>;

/** The company's own questions as a section of the form, if it has any. */
async function companySection(admin: Admin, orgId: string): Promise<FormSection | null> {
  const { custom } = await companyQuestions(admin, orgId);
  return customSection(custom.application, { title: APPLICATION_CUSTOM_TITLE });
}

/**
 * The application form's server side (RECRUITMENT.md, release 2a). Nobody is
 * signed in here: every call proves itself with the link's token, and runs as
 * the service role only after that check. Brought across from MyRoster's
 * /api/recruit/application route.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const todayIso = () => new Date().toISOString().slice(0, 10);

async function ip(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}

/**
 * Someone starts an application from the company's apply link. A new email
 * gets their form straight away; an email the company already has gets the
 * link by email instead — whoever typed it may not be them.
 */
export async function startApplicationAction(
  applyToken: string,
  _prev: { error?: string; emailed?: boolean; link?: string },
  formData: FormData,
): Promise<{ error?: string; emailed?: boolean; link?: string }> {
  if (!rateLimit(`apply:${await ip()}`, 8, 60 * 60_000)) {
    return { error: "Too many applications from here in the last hour. Please try again later." };
  }
  const firstName = String(formData.get("firstName") ?? "").trim().slice(0, 80);
  const surname = String(formData.get("surname") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const mobile = String(formData.get("mobile") ?? "").trim().slice(0, 40);
  if (!firstName || !surname) return { error: "Please give your first name and surname." };
  if (!EMAIL.test(email)) return { error: "Please give an email address we can reach you on." };

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("recruitment_settings")
    .select("organisation_id, organisations(name)")
    .eq("apply_token", applyToken)
    .maybeSingle();
  if (!settings || !(await hasFeatureForOrg(admin, settings.organisation_id as string, "recruitment.tracker"))) {
    return { error: "This apply link isn't working. Ask the company for a new one." };
  }
  const orgId = settings.organisation_id as string;
  const company = (settings.organisations as unknown as { name: string } | null)?.name ?? "the company";

  const { data: existing } = await admin
    .from("candidates")
    .select("id, candidate_applications(id, status)")
    .eq("organisation_id", orgId)
    .ilike("email", email)
    .eq("status", "candidate")
    .limit(1)
    .maybeSingle();
  if (existing) {
    const app = (existing.candidate_applications as unknown as { id: string }[] | null)?.[0];
    if (app) {
      const link = await issueApplicationLink(admin, app.id);
      await emailApplicationLink({ to: email, firstName, company, link, organisationId: orgId });
    }
    return { emailed: true };
  }

  const { data: candidate, error } = await admin
    .from("candidates")
    .insert({ organisation_id: orgId, full_name: `${firstName} ${surname}`, email, phone: mobile || null })
    .select("id")
    .single();
  if (error || !candidate) return { error: "Your application couldn't be started. Please try again." };
  const { data: app } = await admin
    .from("candidate_applications")
    .insert({
      organisation_id: orgId,
      candidate_id: candidate.id,
      answers: sanitiseAnswers({ firstName, surname, email, mobile }),
    })
    .select("id")
    .single();
  if (!app) return { error: "Your application couldn't be started. Please try again." };
  const link = await issueApplicationLink(admin, app.id as string);
  // The same link by email too, so they can come back to it.
  await emailApplicationLink({ to: email, firstName, company, link, organisationId: orgId });
  return { link };
}

export interface LoadedApplication {
  company: string;
  status: "draft" | "submitted";
  answers: Answers;
  officeNote: string | null;
  firstName: string;
  /** The company's own questions, shown before the declaration. */
  company_questions: FormSection | null;
}

export async function loadApplicationAction(token: string): Promise<LoadedApplication | { error: string }> {
  const admin = createAdminClient();
  const app = await applicationForToken(admin, token);
  if (!app) return { error: "This link has expired or isn't valid any more. Ask the company to send you a new one." };
  const answers = (app.answers ?? {}) as Answers;
  return {
    company: (app.organisations as unknown as { name: string } | null)?.name ?? "",
    status: app.status as "draft" | "submitted",
    answers,
    officeNote: (app.office_note as string | null) ?? null,
    firstName: typeof answers.firstName === "string" ? answers.firstName : "",
    company_questions: await companySection(admin, app.organisation_id as string),
  };
}

/** Answers saved as they go. Nothing changes once it's been sent. */
export async function saveApplicationAction(token: string, raw: unknown): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  const app = await applicationForToken(admin, token);
  if (!app || app.status !== "draft") return { ok: false };
  const sections = applicationSections(await companySection(admin, app.organisation_id as string));
  await admin.from("candidate_applications").update({ answers: sanitiseAnswers(raw, sections) }).eq("id", app.id as string);
  return { ok: true };
}

/**
 * Send the application: every rule checked again here, then the Application
 * step goes in front of the office as "waiting on you", and the candidate's
 * record takes their name, phone, postcode, role and where they heard of us.
 */
export async function submitApplicationAction(
  token: string,
  raw: unknown,
  signature: { dataUrl: string; signedName: string },
): Promise<{ ok: boolean; error?: string; problems?: Record<string, FieldError[]> }> {
  const admin = createAdminClient();
  const app = await applicationForToken(admin, token);
  if (!app) return { ok: false, error: "This link has expired. Ask the company to send you a new one." };
  if (app.status === "submitted") return { ok: true };
  const sections = applicationSections(await companySection(admin, app.organisation_id as string));
  const answers = sanitiseAnswers(raw, sections);
  const problems = validateApplication(answers, todayIso(), sections);
  if (Object.keys(problems).length) return { ok: false, error: "Some sections still need attention.", problems };
  const dataUrl = typeof signature?.dataUrl === "string" ? signature.dataUrl : "";
  const signedName = typeof signature?.signedName === "string" ? signature.signedName.trim().slice(0, 120) : "";
  if (!dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > 200_000 || !signedName) {
    return { ok: false, error: "Please sign in the box and type your full name." };
  }

  const now = new Date().toISOString();
  await admin
    .from("candidate_applications")
    .update({ answers, status: "submitted", submitted_at: now, office_note: null, signature: { dataUrl, signedName, signedAt: now } })
    .eq("id", app.id as string);

  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const name = [text(answers.firstName), text(answers.surname)].filter(Boolean).join(" ");
  await admin
    .from("candidates")
    .update({
      ...(name && { full_name: name }),
      email: text(answers.email),
      phone: text(answers.mobile),
      postcode: text(answers.postcode)?.toUpperCase() ?? null,
      role_applied: text(answers.roleApplied),
      source: text(answers.heardFrom),
      is_driver: answers.drivingLicence === "yes",
    })
    .eq("id", app.candidate_id as string);

  await admin.from("candidate_documents").upsert(
    {
      candidate_id: app.candidate_id,
      organisation_id: app.organisation_id,
      doc_type: "application",
      file_path: null,
      file_name: null,
      not_required: false,
      review_status: "submitted",
      review_note: null,
      uploaded_by_candidate: true,
    },
    { onConflict: "candidate_id,doc_type" },
  );
  // A login to follow it from here, if they haven't one: best effort — the
  // office can send it again from the candidate's page.
  const { data: c } = await admin.from("candidates").select("user_id").eq("id", app.candidate_id as string).maybeSingle();
  if (c && !c.user_id) await inviteCandidate(admin, app.candidate_id as string).catch(() => null);
  return { ok: true };
}

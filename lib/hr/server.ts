import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { sendEmail } from "@/lib/email";
import { orgBranding } from "@/lib/branding";
import { STAFF_ROLES } from "@/lib/roles";
import { addMonths } from "@/lib/records";
import { renderHrPdf, ukDate } from "@/lib/hr-pdf";
import { draftLetter, hrLetterHtml, sanitiseOverrides, templateInForce, type LetterValues } from "@/lib/hr/letters";
import { DEFAULT_PROBATION, probationFromRow, type ProbationFacts, type ProbationSettings } from "@/lib/hr/probation";

/**
 * The HR pack's server side (HR-PACK.md): every action runs as the service
 * role after checking for itself what RLS would — the person is one of this
 * company's staff and the company has the HR pack.
 */

export type Admin = ReturnType<typeof createAdminClient>;

export const HR_BUCKET = "hr-docs";

export interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string;
  organisation_id: string;
}

export const personName = (p: Pick<Person, "full_name" | "email">) => p.full_name || p.email || "Unnamed";
export const firstName = (p: Pick<Person, "full_name" | "email">) => (p.full_name ?? "").trim().split(/\s+/)[0] || "there";

/** The company has the HR pack, and the person is one of its staff. Null otherwise. */
export async function hrPerson(admin: Admin, orgId: string | null, userId: string): Promise<Person | null> {
  if (!orgId || !(await hasFeatureForOrg(admin, orgId, "recruitment.tracker"))) return null;
  const { data } = await admin.from("users").select("id, full_name, email, role, status, organisation_id").eq("id", userId).maybeSingle();
  if (!data || data.organisation_id !== orgId || !(STAFF_ROLES as readonly string[]).includes(data.role as string)) return null;
  return data as Person;
}

export async function loadHrSettingsRow(admin: Admin, orgId: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin.from("hr_settings").select("*").eq("organisation_id", orgId).maybeSingle();
  return data;
}

export async function probationSettings(admin: Admin, orgId: string): Promise<ProbationSettings> {
  const row = await loadHrSettingsRow(admin, orgId);
  return row ? probationFromRow(row) : DEFAULT_PROBATION;
}

/**
 * Their employment row, made when first needed. On hire it starts from the
 * candidate's start date; otherwise the office sets the start date.
 */
export async function setEmployment(
  admin: Admin,
  orgId: string,
  userId: string,
  patch: { start_date?: string | null; job_title?: string | null; probation_status?: string; probation_ends_on?: string | null },
  by: string | null,
): Promise<{ error?: string }> {
  const { data: existing } = await admin.from("staff_employment").select("*").eq("user_id", userId).maybeSingle();
  const next = { ...(existing ?? { probation_status: "in_probation" }), ...patch } as Record<string, unknown>;
  // A new start date with no extension moves the end of probation with it.
  if (patch.start_date !== undefined && patch.probation_ends_on === undefined && next.probation_status === "in_probation") {
    const s = await probationSettings(admin, orgId);
    next.probation_ends_on = patch.start_date ? addMonths(patch.start_date, s.months) : null;
  }
  const { error } = await admin.from("staff_employment").upsert(
    {
      user_id: userId,
      organisation_id: orgId,
      start_date: next.start_date ?? null,
      job_title: next.job_title ?? null,
      probation_status: next.probation_status ?? "in_probation",
      probation_ends_on: next.probation_ends_on ?? null,
      updated_by: by,
    },
    { onConflict: "user_id" },
  );
  return error ? { error: error.message } : {};
}

/** What the site already knows, for the probation review form (HR-PACK.md). */
export async function probationFacts(admin: Admin, orgId: string, userId: string): Promise<ProbationFacts> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: pathway }, { data: enrolments }, audits, checks] = await Promise.all([
    admin.from("pathways").select("pathway_courses(course_id)").eq("slug", "care-certificate").maybeSingle(),
    admin.from("enrolments").select("course_id, status, due_date").eq("user_id", userId).limit(1000),
    hasFeatureForOrg(admin, orgId, "people.supervisions"),
    hasFeatureForOrg(admin, orgId, "people.competency"),
  ]);
  const ids = new Set(((pathway?.pathway_courses ?? []) as Array<{ course_id: string }>).map((r) => r.course_id));
  const mine = enrolments ?? [];
  const inInduction = mine.filter((e) => ids.has(e.course_id as string));
  const [{ count: supervisions }, { data: spots }, { data: comps }] = await Promise.all([
    audits
      ? admin.from("supervisions").select("id", { count: "exact", head: true }).eq("user_id", userId)
      : Promise.resolve({ count: 0 }),
    checks
      ? admin.from("spot_checks").select("checked_on, outcome").eq("user_id", userId).order("checked_on", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    checks
      ? admin.from("competency_checks").select("checked_on, area, outcome").eq("user_id", userId).order("checked_on", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  return {
    induction: inInduction.length ? { done: inInduction.filter((e) => e.status === "completed").length, total: inInduction.length } : null,
    trainingOverdue: mine.filter((e) => e.status !== "completed" && e.due_date && (e.due_date as string) < today).length,
    trainingCompleted: mine.filter((e) => e.status === "completed").length,
    supervisions: supervisions ?? 0,
    spotChecks: (spots ?? []).map((s) => ({ on: s.checked_on as string, outcome: s.outcome as string })),
    competency: (comps ?? []).map((c) => ({ on: c.checked_on as string, area: c.area as string, outcome: c.outcome as string })),
  };
}

// ─── Letters ────────────────────────────────────────────────────────────────

/** The values every letter can use, for one person. */
export async function personValues(admin: Admin, orgId: string, person: Person): Promise<LetterValues> {
  const [{ data: org }, { data: emp }] = await Promise.all([
    admin.from("organisations").select("name").eq("id", orgId).maybeSingle(),
    admin.from("staff_employment").select("start_date, job_title").eq("user_id", person.id).maybeSingle(),
  ]);
  return {
    firstName: firstName(person),
    fullName: personName(person),
    companyName: (org?.name as string | undefined) ?? "",
    jobTitle: (emp?.job_title as string | null) || (person.role === "learner" ? "Carer" : "member of staff"),
    startDate: emp?.start_date ? ukDate(emp.start_date as string) : "",
  };
}

/**
 * A new draft letter from the company's template, filled in. Nothing is sent:
 * a person reads, edits and sends it from the letter page.
 */
export async function createLetterDraft(
  admin: Admin,
  args: { orgId: string; person: Person; kind: string; sourceType?: string; sourceId?: string; values: LetterValues; by: string },
): Promise<{ id?: string; error?: string }> {
  const settings = await loadHrSettingsRow(admin, args.orgId);
  const template = templateInForce(args.kind, sanitiseOverrides(settings?.letter_templates));
  if (!template) return { error: "Unknown letter." };
  const { data: me } = await admin.from("users").select("full_name").eq("id", args.by).maybeSingle();
  const values = { managerName: (me?.full_name as string | null) ?? "", ...(await personValues(admin, args.orgId, args.person)), ...args.values };
  const draft = draftLetter(template, values);
  const { data, error } = await admin
    .from("hr_letters")
    .insert({
      organisation_id: args.orgId,
      user_id: args.person.id,
      kind: args.kind,
      source_type: args.sourceType ?? null,
      source_id: args.sourceId ?? null,
      subject: draft.subject,
      body: draft.body,
      fixed: draft.fixed,
      created_by: args.by,
    })
    .select("id")
    .single();
  if (error) return { error: "The letter couldn't be started. Try again." };
  return { id: data.id as string };
}

export async function letterSigner(admin: Admin, orgId: string, by: string): Promise<{ name: string; title: string }> {
  const [settings, { data: me }] = await Promise.all([
    loadHrSettingsRow(admin, orgId),
    admin.from("users").select("full_name, role").eq("id", by).maybeSingle(),
  ]);
  const name = (settings?.letter_signatory_name as string | null) || (me?.full_name as string | null) || "";
  const title = (settings?.letter_signatory_title as string | null) || (me?.role === "org_admin" ? "Manager" : "Office");
  return { name, title };
}

/**
 * Send a draft: emailed to the person, rendered to a PDF kept with the letter,
 * and marked sent. Returns an error in words the office can act on.
 */
export async function sendLetter(admin: Admin, letterId: string, orgId: string, by: string): Promise<{ ok: boolean; error?: string }> {
  const { data: letter } = await admin.from("hr_letters").select("*").eq("id", letterId).maybeSingle();
  if (!letter || letter.organisation_id !== orgId) return { ok: false, error: "Letter not found." };
  if (letter.status === "sent") return { ok: false, error: "It has already been sent." };
  const person = await hrPerson(admin, orgId, letter.user_id as string);
  if (!person) return { ok: false, error: "That person is not one of your staff." };
  if (!person.email) return { ok: false, error: "They have no email address on their login." };
  const [{ data: org }, signer, brand] = await Promise.all([
    admin.from("organisations").select("name").eq("id", orgId).maybeSingle(),
    letterSigner(admin, orgId, by),
    orgBranding(orgId),
  ]);
  const company = (org?.name as string | undefined) ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const fixed = Array.isArray(letter.fixed) ? (letter.fixed as string[]) : [];
  const greeting = `Dear ${firstName(person)},`;
  const body = String(letter.body);

  const pdf = await renderHrPdf(company, [
    {
      title: String(letter.subject),
      subtitle: `${personName(person)} · ${ukDate(today)}`,
      blocks: [
        { type: "para", text: greeting },
        ...[...body.split(/\n{2,}/), ...fixed].map((t) => t.trim()).filter(Boolean).map((text) => ({ type: "para" as const, text })),
        { type: "para", text: "Yours sincerely," },
        { type: "signature", name: signer.name || company, title: [signer.title, company].filter(Boolean).join(", ") },
      ],
    },
  ], brand?.logoUrl);
  const path = `${orgId}/${person.id}/letters/${letterId}.pdf`;
  const { error: upErr } = await admin.storage.from(HR_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) return { ok: false, error: "The letter couldn't be saved as a PDF. Try again." };

  const sent = await sendEmail({
    to: person.email,
    organisationId: orgId,
    subject: String(letter.subject),
    html: hrLetterHtml({ company, date: ukDate(today), greeting, body, fixed, signer }),
  });
  if (!sent) return { ok: false, error: "The email couldn't be sent. Try again in a minute." };
  await admin
    .from("hr_letters")
    .update({ status: "sent", sent_at: new Date().toISOString(), sent_to: person.email, sent_by: by, pdf_path: path })
    .eq("id", letterId);
  return { ok: true };
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { DEFAULT_WELCOME_GUIDE, sanitiseContacts, welcomeHtml } from "@/lib/welcome-pack";
import { STAFF_FILE_SOURCES } from "@/lib/staff-documents";
import { answerText, isShown, type Answers, type FormSection } from "@/lib/recruitment-application";
import { kindForType, referenceSections } from "@/lib/recruitment-references";
import { companyQuestions } from "@/lib/company-questions";
import { DBS_RISK_CUSTOM_TITLE, dbsRiskSections } from "@/lib/recruitment-dbs-risk";
import { REFERENCE_CUSTOM_TITLE, customSection } from "@/lib/custom-questions";
import { renderHrPdf, ukDate, type HrBlock, type HrDoc } from "@/lib/hr-pdf";
import { orgBranding } from "@/lib/branding";

/**
 * What hiring does beyond the status (RECRUITMENT.md, release 6): the checked
 * documents move onto the staff file with their expiry dates, so reminders
 * carry on; their induction starts; and the welcome pack is emailed.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Copy the checked files across. Never overwrites a document the staff file already has. Returns what moved. */
export async function copyToStaffFile(admin: Admin, candidateId: string, orgId: string, userId: string, by: string): Promise<string[]> {
  const [{ data: docs }, { data: held }] = await Promise.all([
    admin.from("candidate_documents").select("doc_type, file_path, file_name, expires_at, review_status").eq("candidate_id", candidateId),
    admin.from("staff_documents").select("doc_type").eq("user_id", userId),
  ]);
  const moved: string[] = [];
  for (const { staffDoc, from } of STAFF_FILE_SOURCES) {
    if ((held ?? []).some((h) => h.doc_type === staffDoc)) continue;
    const src = from.map((k) => (docs ?? []).find((d) => d.doc_type === k && d.file_path && d.review_status === "confirmed")).find(Boolean);
    if (!src?.file_path) continue;
    const { data: file } = await admin.storage.from("candidate-docs").download(src.file_path as string);
    if (!file) continue;
    const name = String(src.file_name ?? `${staffDoc}`).replace(/[^\w.\- ]+/g, "");
    const path = `${orgId}/${userId}/${staffDoc}-${crypto.randomUUID()}-${name}`;
    const { error: upErr } = await admin.storage.from("staff-docs").upload(path, file, { contentType: file.type || undefined });
    if (upErr) continue;
    const { error } = await admin.from("staff_documents").insert({
      organisation_id: orgId,
      user_id: userId,
      doc_type: staffDoc,
      file_path: path,
      file_name: src.file_name,
      expires_at: src.expires_at,
      not_required: false,
      uploaded_by: by,
    });
    if (error) await admin.storage.from("staff-docs").remove([path]);
    else moved.push(staffDoc);
  }
  return moved;
}

/** A form's answers as PDF blocks: only what was asked and shown. */
export function answerBlocks(sections: FormSection[], answers: Answers): HrBlock[] {
  return sections.flatMap((s) => {
    const shown = s.fields.filter((f) => f.type !== "info" && isShown(f, answers) && answers[f.id] !== undefined && answers[f.id] !== "");
    if (!shown.length) return [];
    return [{ type: "heading" as const, text: s.title }, ...shown.map((f) => ({ type: "qa" as const, q: f.label, a: answerText(f, answers[f.id]) }))];
  });
}

/**
 * What was written online moves too, as a PDF of it (HR-PACK.md; until 31
 * Oct 2026 references taken online stayed in the recruitment record, since
 * the staff file only holds files): the references, and the DBS risk
 * assessment. A file already on the staff file is never replaced. Returns
 * what moved.
 */
export async function copyRecordsToStaffFile(admin: Admin, candidateId: string, orgId: string, userId: string, by: string): Promise<string[]> {
  const [{ data: held }, { data: cand }, { data: refs }, { data: risk }, { data: org }, { custom }, brand] = await Promise.all([
    admin.from("staff_documents").select("doc_type").eq("user_id", userId),
    admin.from("candidates").select("full_name, dbs_conviction").eq("id", candidateId).maybeSingle(),
    admin
      .from("candidate_references")
      .select("position, referee_type, referee_name, referee_position, organisation, email, received_at, answers, status")
      .eq("candidate_id", candidateId)
      .order("position"),
    admin.from("candidate_dbs_assessments").select("status, answers, completed_at").eq("candidate_id", candidateId).maybeSingle(),
    admin.from("organisations").select("name").eq("id", orgId).maybeSingle(),
    companyQuestions(admin, orgId),
    orgBranding(orgId),
  ]);
  const has = new Set((held ?? []).map((h) => h.doc_type as string));
  const company = (org?.name as string | undefined) ?? "";
  const name = (cand?.full_name as string | undefined) ?? "";
  const moved: string[] = [];

  const put = async (docType: string, docs: HrDoc[], fileName: string) => {
    const pdf = await renderHrPdf(company, docs, brand?.logoUrl);
    const path = `${orgId}/${userId}/${docType}-${crypto.randomUUID()}-${fileName}`;
    const { error: upErr } = await admin.storage.from("staff-docs").upload(path, pdf, { contentType: "application/pdf" });
    if (upErr) return;
    const { error } = await admin.from("staff_documents").insert({
      organisation_id: orgId,
      user_id: userId,
      doc_type: docType,
      file_path: path,
      file_name: fileName,
      expires_at: null,
      not_required: false,
      uploaded_by: by,
    });
    if (error) await admin.storage.from("staff-docs").remove([path]);
    else moved.push(docType);
  };

  const online = (refs ?? []).filter((r) => r.status === "received" && r.answers);
  if (!has.has("references") && online.length) {
    const company_ = customSection(custom.reference, { title: REFERENCE_CUSTOM_TITLE, forRecord: true });
    const docs: HrDoc[] = online.map((r) => {
      const kind = kindForType(r.referee_type as string);
      return {
        title: `Reference ${r.position}: ${r.referee_name as string}`,
        subtitle: `${r.referee_type as string} for ${name}${r.received_at ? `, received ${ukDate(r.received_at as string)}` : ""}`,
        blocks: [
          ...(r.organisation ? [{ type: "meta" as const, label: "Organisation", value: r.organisation as string }] : []),
          ...(r.email ? [{ type: "meta" as const, label: "Email", value: r.email as string }] : []),
          ...answerBlocks(referenceSections(kind, company_), r.answers as Answers),
        ],
      };
    });
    const others = (refs ?? []).filter((r) => !online.includes(r)).map((r) => `Reference ${r.position} (${r.referee_name as string}): not taken online, so held in the recruitment record.`);
    if (others.length) docs[docs.length - 1].blocks.push({ type: "heading", text: "Other references" }, { type: "list", items: others });
    await put("references", docs, "References.pdf");
  }

  if (!has.has("dbs_risk_assessment") && cand?.dbs_conviction && risk?.status === "complete") {
    const sections = dbsRiskSections(customSection(custom.dbs_risk, { title: DBS_RISK_CUSTOM_TITLE, forRecord: true }));
    await put(
      "dbs_risk_assessment",
      [{ title: "DBS risk assessment", subtitle: `${name} · completed ${ukDate(risk.completed_at as string)}`, blocks: answerBlocks(sections, risk.answers as Answers) }],
      "DBS risk assessment.pdf",
    );
  }
  return moved;
}

/** Induction: the Care Certificate pathway, due 12 weeks from their start date (or today). */
export async function startInduction(admin: Admin, orgId: string, userId: string, startDate: string | null): Promise<number> {
  const { data: pathway } = await admin.from("pathways").select("id, pathway_courses(course_id)").eq("slug", "care-certificate").maybeSingle();
  const courseIds = ((pathway?.pathway_courses ?? []) as Array<{ course_id: string }>).map((r) => r.course_id);
  if (!courseIds.length) return 0;
  const from = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? new Date(`${startDate}T12:00:00Z`) : new Date();
  const due = new Date(from.getTime() + 84 * 86_400_000).toISOString().slice(0, 10);
  const { error } = await admin
    .from("enrolments")
    .upsert(courseIds.map((course_id) => ({ organisation_id: orgId, user_id: userId, course_id, due_date: due })), { onConflict: "user_id,course_id", ignoreDuplicates: true });
  return error ? 0 : courseIds.length;
}

export async function sendWelcomePack(admin: Admin, candidateId: string, orgId: string): Promise<boolean> {
  const [{ data: c }, { data: settings }] = await Promise.all([
    admin.from("candidates").select("full_name, email, start_date, organisations(name)").eq("id", candidateId).maybeSingle(),
    admin.from("recruitment_settings").select("welcome_guide, welcome_contacts").eq("organisation_id", orgId).maybeSingle(),
  ]);
  if (!c?.email) return false;
  const companyName = (c.organisations as unknown as { name: string } | null)?.name ?? "";
  const startDate = c.start_date
    ? new Date(`${c.start_date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : "the date the office has given you";
  const html = welcomeHtml({
    guide: (settings?.welcome_guide as string | null) ?? DEFAULT_WELCOME_GUIDE,
    contacts: sanitiseContacts(settings?.welcome_contacts),
    values: { firstName: String(c.full_name ?? "").trim().split(/\s+/)[0] || "there", companyName, startDate },
    signInUrl: `${await siteOrigin()}/login`,
  });
  return sendEmail({ to: c.email as string, subject: `Welcome to ${companyName || "the team"}`, html, organisationId: orgId });
}

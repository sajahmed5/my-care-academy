import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { DEFAULT_WELCOME_GUIDE, sanitiseContacts, welcomeHtml } from "@/lib/welcome-pack";
import { STAFF_FILE_SOURCES } from "@/lib/staff-documents";

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
  return sendEmail({ to: c.email as string, subject: `Welcome to ${companyName || "the team"}`, html });
}

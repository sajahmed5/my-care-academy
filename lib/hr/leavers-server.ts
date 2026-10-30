import "server-only";
import { fetchAll } from "@/lib/fetch-all";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { siteOrigin } from "@/lib/site-url";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { hashToken, newToken } from "@/lib/candidate-links";
import { renderHrPdf, ukDate, type HrBlock } from "@/lib/hr-pdf";
import { EXIT_SECTIONS, loginDueOff } from "@/lib/hr/leavers";
import { sanitiseWith, validateSection } from "@/lib/recruitment-application";
import { firstName, personName, type Admin } from "@/lib/hr/server";

/**
 * What leaving does on its own (HR-PACK.md): their login is switched off
 * after their last working day, and a PDF of their training record, with
 * their certificates, is emailed to them so they take it to their next job.
 */

/** At most this many certificates go with the email, to stay inside the email size limit. */
const MAX_CERTIFICATES = 25;

export async function emailTrainingRecord(admin: Admin, orgId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const [{ data: person }, { data: org }, { data: enrolments }, { data: certs }] = await Promise.all([
    admin.from("users").select("id, full_name, email").eq("id", userId).maybeSingle(),
    admin.from("organisations").select("name").eq("id", orgId).maybeSingle(),
    admin.from("enrolments").select("status, courses(title)").eq("user_id", userId).limit(1000),
    admin
      .from("certificates")
      .select("certificate_number, issued_at, expires_at, pdf_path, courses(title)")
      .eq("user_id", userId)
      .order("issued_at", { ascending: false })
      .limit(500),
  ]);
  if (!person?.email) return { ok: false, error: "They have no email address." };
  const company = (org?.name as string | undefined) ?? "";
  const title = (r: { courses: unknown }) => ((Array.isArray(r.courses) ? r.courses[0] : r.courses) as { title?: string } | null)?.title ?? "Course";
  const done = (enrolments ?? []).filter((e) => e.status === "completed");
  const blocks: HrBlock[] = [
    { type: "meta", label: "Name", value: personName(person as never) },
    { type: "meta", label: "Employer", value: company },
    { type: "meta", label: "Courses completed", value: String(done.length) },
    { type: "meta", label: "Certificates", value: String((certs ?? []).length) },
    { type: "heading", text: "Certificates" },
    ...((certs ?? []).length
      ? [
          {
            type: "list" as const,
            items: (certs ?? []).map(
              (c) =>
                `${title(c)}: certificate ${c.certificate_number as string}, issued ${ukDate(c.issued_at as string)}${c.expires_at ? `, expires ${ukDate(c.expires_at as string)}` : ""}`,
            ),
          },
        ]
      : [{ type: "para" as const, text: "None." }]),
    { type: "heading", text: "Courses completed (the dates are on the certificates)" },
    ...(done.length
      ? [{ type: "list" as const, items: done.map((e) => title(e)).sort() }]
      : [{ type: "para" as const, text: "None." }]),
    { type: "para", text: "Certificates can be checked by anyone on My Care Academy's certificate checker, using the certificate number." },
  ];
  const record = await renderHrPdf(company, [{ title: "Training record", subtitle: `${personName(person as never)} · ${ukDate(new Date().toISOString())}`, blocks }]);
  const attachments = [{ filename: "Training record.pdf", content: record.toString("base64") }];
  for (const c of (certs ?? []).filter((c) => c.pdf_path).slice(0, MAX_CERTIFICATES)) {
    const { data } = await admin.storage.from("certificates").download(c.pdf_path as string);
    if (data) attachments.push({ filename: `${title(c).replace(/[^\w .-]+/g, "").slice(0, 60)} ${c.certificate_number as string}.pdf`, content: Buffer.from(await data.arrayBuffer()).toString("base64") });
  }
  const sent = await sendEmail({
    to: person.email as string,
    subject: `Your training record from ${company || "your employer"}`,
    html: emailLayout({
      body: `<p>Hi ${esc(firstName(person as never))},</p>
<p>As you leave ${esc(company || "us")}, here is your training record and your certificates, attached, to take to your next job.</p>
<p>Thank you for the care you've given, and good luck.</p>`,
      footer: `My Care Academy — sent for ${esc(company || "your employer")}.`,
    }),
    attachments,
  });
  if (!sent) return { ok: false, error: "The email didn't send. Try again later." };
  await admin.from("hr_leavers").update({ training_sent_at: new Date().toISOString() }).eq("user_id", userId);
  return { ok: true };
}

/**
 * Switch their login off, as the console's Deactivate does: the status, and a
 * ban at the auth layer. Never the company's last active manager.
 */
export async function switchOffLogin(admin: Admin, orgId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await admin.from("users").select("role, status, organisation_id").eq("id", userId).maybeSingle();
  if (!u || u.organisation_id !== orgId) return { ok: false, error: "Not found." };
  if (u.role === "org_admin") {
    const { count } = await admin.from("users").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("role", "org_admin").eq("status", "active");
    if ((count ?? 0) <= 1) return { ok: false, error: "They're your only manager: give someone else the Manager role first." };
  }
  if (u.status !== "deactivated") {
    const { error } = await admin.from("users").update({ status: "deactivated" }).eq("id", userId);
    if (error) return { ok: false, error: error.message };
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  }
  await admin.from("hr_leavers").update({ login_off_at: new Date().toISOString() }).eq("user_id", userId);
  return { ok: true };
}

/** Ask for the exit interview by link: they may have no login by the time they answer. */
export async function sendExitLink(admin: Admin, orgId: string, leaverId: string, userId: string): Promise<boolean> {
  const [{ data: person }, { data: org }, origin] = await Promise.all([
    admin.from("users").select("full_name, email").eq("id", userId).maybeSingle(),
    admin.from("organisations").select("name").eq("id", orgId).maybeSingle(),
    siteOrigin(),
  ]);
  if (!person?.email) return false;
  const raw = newToken();
  await admin
    .from("hr_leavers")
    .update({ exit_status: "asked", exit_token_hash: hashToken(raw), exit_token_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
    .eq("id", leaverId);
  const company = (org?.name as string | undefined) ?? "your employer";
  return sendEmail({
    to: person.email as string,
    subject: `${company}: a few questions as you leave`,
    html: emailLayout({
      body: `<p>Hi ${esc(firstName(person as never))},</p>
<p>${esc(company)} would like to know about your time there, to make it better for the people who come after you. It takes about five minutes, and it's up to you whether to answer.</p>
${emailButton(`${origin}/exit?t=${encodeURIComponent(raw)}`, "Answer the questions")}
<p style="color:#64748b;font-size:13px">The link works for 30 days.</p>`,
      footer: `My Care Academy — sent for ${esc(company)}.`,
    }),
  });
}

/**
 * Each morning: everyone whose last working day has passed has their login
 * switched off and, if it hasn't gone, their training record emailed.
 */
export async function processLeavers(admin: Admin, now: Date, dryRun: boolean): Promise<{ loginsSwitchedOff: number; trainingRecordsSent: number }> {
  const today = now.toISOString().slice(0, 10);
  const due = await fetchAll((f, t) => admin.from("hr_leavers").select("id, organisation_id, user_id, last_day, training_sent_at").is("login_off_at", null).lt("last_day", today).order("id").range(f, t));
  let off = 0;
  let sent = 0;
  for (const l of due) {
    if (!loginDueOff(l.last_day as string, today)) continue;
    if (!(await hasFeatureForOrg(admin, l.organisation_id as string, "recruitment.tracker"))) continue;
    if (dryRun) {
      off++;
      continue;
    }
    if (!l.training_sent_at && (await emailTrainingRecord(admin, l.organisation_id as string, l.user_id as string)).ok) sent++;
    if ((await switchOffLogin(admin, l.organisation_id as string, l.user_id as string)).ok) {
      off++;
      await logAudit({ organisationId: l.organisation_id as string, action: "hr.leaver_login_off", entity: "user", entityId: l.user_id as string, detail: { lastDay: l.last_day } });
    }
  }
  return { loginsSwitchedOff: off, trainingRecordsSent: sent };
}

/** Save an exit interview's answers, from their login or the link. */
export async function saveExitAnswers(admin: Admin, leaverId: string, raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const answers = sanitiseWith(EXIT_SECTIONS, raw);
  const problems = EXIT_SECTIONS.flatMap((s) => validateSection(s, answers, new Date().toISOString().slice(0, 10)));
  if (problems.length) return { ok: false, error: "Please answer the questions marked *." };
  const { error } = await admin
    .from("hr_leavers")
    .update({ exit_answers: answers, exit_status: "done", exit_done_at: new Date().toISOString(), exit_token_hash: null })
    .eq("id", leaverId)
    .eq("exit_status", "asked");
  return error ? { ok: false, error: "It didn't send. Please try again." } : { ok: true };
}

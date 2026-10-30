import "server-only";
import { fetchAll } from "@/lib/fetch-all";
import { sendEmailBatch } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { siteOrigin } from "@/lib/site-url";
import { formatDate } from "@/lib/dates";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { addDays } from "@/lib/hr/probation";
import { caseSettingsFromRow, deadlines, legalReminders, type HrCase } from "@/lib/hr/cases";
import type { Admin } from "@/lib/hr/server";

/**
 * Case deadlines (HR-PACK.md: "the manager gets reminders"): each morning,
 * anyone who can see a case is emailed its deadlines that are missed or fall
 * in the next 2 days, and any legal duty not yet confirmed — once a day at
 * most per case. Who can see it follows can_see_hr_case(): managers and named
 * office workers, never the employee or the person a grievance is about.
 */
export async function processCaseReminders(admin: Admin, now: Date, dryRun: boolean): Promise<{ caseReminders: number }> {
  const today = now.toISOString().slice(0, 10);
  const soon = addDays(today, 2);
  const open = await fetchAll((f, t) => admin.from("hr_cases").select("*").is("closed_on", null).order("id").range(f, t));
  if (!open.length) return { caseReminders: 0 };
  const orgIds = [...new Set(open.map((c) => c.organisation_id as string))];
  const [settings, staff, origin] = await Promise.all([
    fetchAll((f, t) => admin.from("hr_settings").select("*").in("organisation_id", orgIds).order("organisation_id").range(f, t)),
    fetchAll((f, t) => admin.from("users").select("id, email, role, organisation_id").in("organisation_id", orgIds).in("role", ["org_admin", "org_office"]).eq("status", "active").order("id").range(f, t)),
    siteOrigin(),
  ]);
  const entitled = new Set<string>();
  for (const id of orgIds) if (await hasFeatureForOrg(admin, id, "recruitment.tracker")) entitled.add(id);

  const lines = new Map<string, string[]>();
  const touched: string[] = [];
  for (const row of open) {
    const orgId = row.organisation_id as string;
    if (!entitled.has(orgId) || row.reminded_on === today) continue;
    const c = row as unknown as HrCase & { ref: string; about_user_id: string | null };
    const s = caseSettingsFromRow(settings.find((x) => x.organisation_id === orgId));
    const due = deadlines(c, s).filter((d) => d.on <= soon);
    const legal = legalReminders(c);
    if (!due.length && !legal.length) continue;
    touched.push(c.id);
    const text = [
      ...due.map((d) => `${d.what}: ${d.on < today ? "overdue since" : "due"} ${formatDate(d.on, { weekday: "short", day: "numeric", month: "short" })}`),
      ...legal.map((l) => `Legal reminder: ${l}`),
    ];
    const who = staff.filter(
      (u) =>
        u.organisation_id === orgId &&
        u.id !== c.user_id &&
        u.id !== c.about_user_id &&
        (u.role === "org_admin" || s.officeAccess.includes(u.id as string)),
    );
    for (const u of who) {
      const list = lines.get(u.email as string) ?? [];
      list.push(`<li><a href="${esc(`${origin}/org/hr/cases/${c.id}`)}">${esc(c.ref)}</a>: ${text.map(esc).join("; ")}</li>`);
      lines.set(u.email as string, list);
    }
  }
  if (dryRun) return { caseReminders: lines.size };
  await sendEmailBatch(
    [...lines.entries()].map(([to, items]) => ({
      to,
      subject: "HR cases: deadlines coming up",
      html: emailLayout({
        heading: "Deadlines on your HR cases",
        body: `<ul>${items.join("")}</ul>${emailButton(`${origin}/org/hr/cases`, "Open the cases")}`,
      }),
    })),
  );
  if (touched.length) await admin.from("hr_cases").update({ reminded_on: today }).in("id", touched);
  return { caseReminders: lines.size };
}

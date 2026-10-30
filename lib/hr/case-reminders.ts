import "server-only";
import { fetchAll } from "@/lib/fetch-all";
import { sendEmailBatch } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { siteOrigin } from "@/lib/site-url";
import { formatDate } from "@/lib/dates";
import { chunk } from "@/lib/engine-digest";
import { ukToday } from "@/lib/policy-library";
import { IDS_PER_REQUEST, orgsWithFeature } from "@/lib/hr/features";
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
  const today = ukToday(now);
  const soon = addDays(today, 2);
  const open = await fetchAll((f, t) => admin.from("hr_cases").select("*").is("closed_on", null).order("id").range(f, t));
  if (!open.length) return { caseReminders: 0 };
  const entitled = await orgsWithFeature(admin, open.map((c) => c.organisation_id as string), "recruitment.tracker");
  if (!entitled.size) return { caseReminders: 0 };
  // A hundred companies a request: a long .in() list overflows the URL.
  const parts = chunk([...entitled], IDS_PER_REQUEST);
  const [settingsParts, staffParts, origin] = await Promise.all([
    Promise.all(parts.map((ids) => fetchAll((f, t) => admin.from("hr_settings").select("*").in("organisation_id", ids).order("organisation_id").range(f, t)))),
    Promise.all(
      parts.map((ids) =>
        fetchAll((f, t) => admin.from("users").select("id, email, role, organisation_id").in("organisation_id", ids).in("role", ["org_admin", "org_office"]).eq("status", "active").order("id").range(f, t)),
      ),
    ),
    siteOrigin(),
  ]);
  const settings = settingsParts.flat();
  const staff = staffParts.flat();

  // One email per recipient, sent as their company.
  const lines = new Map<string, { to: string; orgId: string; items: string[] }>();
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
      if (!u.email) continue;
      const entry = lines.get(u.id as string) ?? { to: u.email as string, orgId, items: [] };
      entry.items.push(`<li><a href="${esc(`${origin}/org/hr/cases/${c.id}`)}">${esc(c.ref)}</a>: ${text.map(esc).join("; ")}</li>`);
      lines.set(u.id as string, entry);
    }
  }
  if (dryRun) return { caseReminders: lines.size };
  await sendEmailBatch(
    [...lines.values()].map(({ to, orgId, items }) => ({
      to,
      organisationId: orgId,
      subject: "HR cases: deadlines coming up",
      html: emailLayout({
        heading: "Deadlines on your HR cases",
        body: `<ul>${items.join("")}</ul>${emailButton(`${origin}/org/hr/cases`, "Open the cases")}`,
      }),
    })),
  );
  for (const ids of chunk(touched, IDS_PER_REQUEST)) await admin.from("hr_cases").update({ reminded_on: today }).in("id", ids);
  return { caseReminders: lines.size };
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/fetch-all";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { esc } from "@/lib/email-layout";
import { staffDocSummary, type StaffDoc } from "@/lib/staff-documents";
import { probationDue } from "@/lib/hr/probation-due";
import { probationFromRow } from "@/lib/hr/probation";
import { absenceDue, sanitiseTriggers, type Absence } from "@/lib/hr/absence";
import { caseSettingsFromRow, deadlines, type HrCase } from "@/lib/hr/cases";
import { CHECKLIST, checklistDone, sanitiseChecklist } from "@/lib/hr/leavers";

/**
 * The HR pack in the weekly email (HR-PACK.md): one line per part with
 * anything waiting — documents expired or expiring, so a document's
 * reminders carry on after it moves onto the staff file. Each line links to
 * the list that says who. Probation reviews overdue or due in the next two
 * weeks; return-to-work interviews and welfare meetings due, and anyone at a
 * trigger point.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface HrLine {
  label: string;
  text: string;
  href: string;
}

/** People as the weekly job holds them: id → organisation, role and status. */
type People = Map<string, { org: string | null; role: string; status: string }>;

const STAFF = ["learner", "org_admin", "org_office"];

export async function loadHrDigests(admin: Admin, people: People, orgIds: string[], now: Date): Promise<Map<string, HrLine[]>> {
  const out = new Map<string, HrLine[]>();
  const entitled = (await Promise.all(orgIds.map(async (id) => ((await hasFeatureForOrg(admin, id, "recruitment.tracker")) ? id : null)))).filter(
    (x): x is string => !!x,
  );
  if (entitled.length === 0) return out;
  const [docs, emps, reviews, settings, absences, meetings, waiting, cases, leavers] = await Promise.all([
    fetchAll((f, t) =>
      admin
        .from("staff_documents")
        .select("id, organisation_id, user_id, doc_type, file_name, file_path, expires_at, not_required, not_required_reason")
        .in("organisation_id", entitled)
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) =>
      admin.from("staff_employment").select("user_id, organisation_id, start_date, probation_status, probation_ends_on").in("organisation_id", entitled).order("user_id").range(f, t),
    ),
    fetchAll((f, t) =>
      admin
        .from("probation_reviews")
        .select("id, user_id, organisation_id, due_on, status, booked_on, booked_time, held_on, outcome, is_final")
        .in("organisation_id", entitled)
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) =>
      admin.from("hr_settings").select("*").in("organisation_id", entitled).order("organisation_id").range(f, t),
    ),
    fetchAll((f, t) =>
      admin
        .from("sickness_absences")
        .select("id, organisation_id, user_id, start_date, returned_on, reason, certification, fit_note_until, excluded_from_triggers, rtw_status")
        .in("organisation_id", entitled)
        .gte("start_date", new Date(now.getTime() - 400 * 86_400_000).toISOString().slice(0, 10))
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) => admin.from("absence_welfare_meetings").select("absence_id, organisation_id, held_on").in("organisation_id", entitled).order("absence_id").range(f, t)),
    fetchAll((f, t) => admin.from("leave_requests").select("id, organisation_id").in("organisation_id", entitled).eq("status", "requested").order("id").range(f, t)),
    fetchAll((f, t) => admin.from("hr_cases").select("*").in("organisation_id", entitled).is("closed_on", null).order("id").range(f, t)),
    fetchAll((f, t) =>
      admin
        .from("hr_leavers")
        .select("id, organisation_id, last_day, checklist")
        .in("organisation_id", entitled)
        .gte("last_day", new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10))
        .order("id")
        .range(f, t),
    ),
  ]);
  const today = now.toISOString().slice(0, 10);
  for (const orgId of entitled) {
    const current = [...people.entries()].filter(([, p]) => p.org === orgId && p.status === "active" && STAFF.includes(p.role)).map(([id]) => id);
    let expired = 0;
    let expiring = 0;
    for (const id of current) {
      const mine = docs.filter((d) => d.user_id === id) as unknown as StaffDoc[];
      const s = staffDocSummary(mine, now);
      expired += s.expired.length;
      expiring += s.expiring.length;
    }
    const lines: HrLine[] = [];
    if (expired + expiring > 0) {
      lines.push({
        label: "Documents",
        text: [expired && `${expired} expired`, expiring && `${expiring} expiring in the next 30 days`].filter(Boolean).join(", "),
        href: "/org/hr/documents",
      });
    }
    const due = probationDue(
      current.map((id) => ({ id, name: id })),
      emps.filter((e) => e.organisation_id === orgId) as never,
      reviews.filter((r) => r.organisation_id === orgId) as never,
      probationFromRow(settings.find((x) => x.organisation_id === orgId)),
      today,
    );
    const late = due.filter((d) => d.group === "overdue").length;
    const soon = due.filter((d) => d.group === "due_soon").length;
    if (late + soon > 0) {
      lines.push({
        label: "Probation reviews",
        text: [late && `${late} overdue`, soon && `${soon} due in the next 14 days`].filter(Boolean).join(", "),
        href: "/org/hr/probation",
      });
    }
    const sick = absenceDue(
      absences.filter((a) => a.organisation_id === orgId) as unknown as Absence[],
      meetings.filter((m) => m.organisation_id === orgId) as never,
      sanitiseTriggers(settings.find((x) => x.organisation_id === orgId)?.bradford_triggers),
      today,
      new Set(current),
    );
    const absenceText = [
      sick.rtw.length && `${sick.rtw.length} return-to-work interview${sick.rtw.length === 1 ? "" : "s"} due`,
      sick.welfare.length && `${sick.welfare.length} welfare meeting${sick.welfare.length === 1 ? "" : "s"} due`,
      sick.triggers.length && `${sick.triggers.length} ${sick.triggers.length === 1 ? "person" : "people"} at a trigger point`,
    ].filter(Boolean);
    if (absenceText.length) lines.push({ label: "Absence", text: absenceText.join(", "), href: "/org/hr/absence" });
    // Every manager gets this email, so a case about a manager isn't counted here.
    const managers = new Set(current.filter((id) => people.get(id)?.role === "org_admin"));
    const caseSettings = caseSettingsFromRow(settings.find((x) => x.organisation_id === orgId));
    const weekOut = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    const dueCases = cases.filter(
      (c) =>
        c.organisation_id === orgId &&
        !managers.has(c.user_id as string) &&
        !managers.has(c.about_user_id as string) &&
        deadlines(c as unknown as HrCase, caseSettings).some((d) => d.on <= weekOut),
    ).length;
    if (dueCases) lines.push({ label: "Disciplinary and grievance", text: `${dueCases} case${dueCases === 1 ? "" : "s"} with a deadline this week`, href: "/org/hr/cases" });
    const mineLeaving = leavers.filter((l) => l.organisation_id === orgId);
    const leavingSoon = mineLeaving.filter((l) => (l.last_day as string) >= today && (l.last_day as string) <= weekOut).length;
    const unfinished = mineLeaving.filter((l) => (l.last_day as string) < today && checklistDone(sanitiseChecklist(l.checklist)) < CHECKLIST.length).length;
    if (leavingSoon + unfinished) {
      lines.push({
        label: "Leavers",
        text: [leavingSoon && `${leavingSoon} leaving this week`, unfinished && `${unfinished} who've left with their checklist unfinished`].filter(Boolean).join(", "),
        href: "/org/hr/leavers",
      });
    }
    const asks = waiting.filter((w) => w.organisation_id === orgId).length;
    if (asks) lines.push({ label: "Holidays", text: `${asks} request${asks === 1 ? "" : "s"} waiting for a decision`, href: "/org/hr/holidays" });
    if (lines.length) out.set(orgId, lines);
  }
  return out;
}

/** The section of the weekly email, or "" when there is nothing to say. */
export function hrDigestHtml(lines: HrLine[], origin: string): string {
  if (!lines.length) return "";
  const items = lines.map((l) => `<li><a href="${esc(origin + l.href)}">${esc(l.label)}</a>: ${esc(l.text)}</li>`).join("");
  return `<p style="margin-top:20px"><strong>HR</strong></p><ul>${items}</ul>`;
}

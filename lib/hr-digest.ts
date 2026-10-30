import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/fetch-all";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { esc } from "@/lib/email-layout";
import { staffDocSummary, type StaffDoc } from "@/lib/staff-documents";
import { probationDue } from "@/lib/hr/probation-due";
import { probationFromRow } from "@/lib/hr/probation";

/**
 * The HR pack in the weekly email (HR-PACK.md): one line per part with
 * anything waiting — documents expired or expiring, so a document's
 * reminders carry on after it moves onto the staff file. Each line links to
 * the list that says who. Probation reviews overdue or due in the next two
 * weeks.
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
  const [docs, emps, reviews, settings] = await Promise.all([
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
    fetchAll((f, t) => admin.from("hr_settings").select("organisation_id, probation_months, probation_review_months").in("organisation_id", entitled).order("organisation_id").range(f, t)),
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

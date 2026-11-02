import "server-only";
import type { UserContext } from "@/lib/auth";
import type { Admin } from "@/lib/hr/server";
import { hiddenAreasWith } from "@/lib/office-access-server";

/**
 * Who may see (and so work on) a disciplinary or grievance case — the same
 * rule as public.can_see_hr_case(), for code running as the service role:
 * managers and office workers (Saj, 2 Nov 2026: office workers do the admin
 * for the managers); never the employee, nor the person a grievance is
 * about (HR-PACK.md). The `admin` client is kept so a later "Who can see
 * what" setting can be read here without changing every caller.
 */
export async function hasCaseAccess(admin: Admin, context: UserContext): Promise<boolean> {
  if (!context.organisationId) return false;
  if (context.role === "org_admin") return true;
  if (context.role !== "org_office") return false;
  // Unless a manager switched cases off for office workers (Who can see what).
  const hidden = await hiddenAreasWith(admin, context.organisationId);
  return !hidden.has("people.cases");
}

export async function canSeeCase(admin: Admin, context: UserContext, c: Record<string, unknown>): Promise<boolean> {
  if (c.organisation_id !== context.organisationId) return false;
  if (c.user_id === context.userId || c.about_user_id === context.userId) return false;
  return hasCaseAccess(admin, context);
}

/** The case, if this person may see it. */
export async function loadCase(admin: Admin, context: UserContext, id: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin.from("hr_cases").select("*").eq("id", id).maybeSingle();
  if (!data || !(await canSeeCase(admin, context, data))) return null;
  return data;
}

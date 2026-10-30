import "server-only";
import type { UserContext } from "@/lib/auth";
import type { Admin } from "@/lib/hr/server";
import { loadCase } from "@/lib/hr/case-access";

/**
 * Who may read a letter. Every console user may read the letters of the
 * staff on their company's HR pack, except a case's letters, which are as
 * private as the case (managers, and named office workers; never the person
 * a case is about). The same rule as the hr_letters policy, for code running
 * as the service role.
 */
export async function canSeeLetter(admin: Admin, context: UserContext, letter: Record<string, unknown>): Promise<boolean> {
  if (letter.organisation_id !== context.organisationId) return false;
  if (letter.source_type === "case") return !!(await loadCase(admin, context, letter.source_id as string));
  return true;
}

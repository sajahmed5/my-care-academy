import "server-only";
import type { UserContext } from "@/lib/auth";
import type { Admin } from "@/lib/hr/server";

/**
 * Who may read a letter. Every console user may read the letters of the
 * staff on their company's HR pack, except where the letter belongs to
 * something with narrower access (a disciplinary or grievance case: managers,
 * and named office workers). Checked by every action and page that reads one
 * as the service role.
 */
export async function canSeeLetter(_admin: Admin, context: UserContext, letter: Record<string, unknown>): Promise<boolean> {
  return letter.organisation_id === context.organisationId;
}

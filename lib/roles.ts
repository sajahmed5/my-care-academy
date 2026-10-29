/**
 * Everyone in a company is a member of staff (PACKAGES.md, Staff logins,
 * 29 Oct 2026): carers, office workers and managers all have training,
 * certificates and their own file. Console access is on top of that, for the
 * two console roles. "learner" in the database means staff without it.
 *
 * Pure, so client components can use it; lib/auth re-exports it.
 */
export const STAFF_ROLES = ["learner", "org_admin", "org_office"] as const;

export function isStaff(role: string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

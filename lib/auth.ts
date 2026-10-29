import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/roles";

/** "candidate": someone applying, with a login to follow it and no organisation (RECRUITMENT.md). */
export type UserRole = "platform_admin" | "org_admin" | "org_office" | "learner" | "candidate";

/**
 * The two roles that open the organisation console. org_admin is the manager:
 * the whole console plus the Account page (billing, and who else has console
 * access). org_office is the office worker: everything except Account. The
 * database treats them as one (is_console_user()); the split is here.
 */
export const CONSOLE_ROLES: readonly UserRole[] = ["org_admin", "org_office"];

export function isConsoleRole(role: UserRole | null): boolean {
  return role !== null && CONSOLE_ROLES.includes(role);
}

export { STAFF_ROLES } from "@/lib/roles";

export function isStaffRole(role: UserRole | null): boolean {
  return isStaff(role);
}

/**
 * How a role reads in the UI — the only wording for it. The sidebar kept a
 * second copy that said "Organisation admin" and "Office worker" where this
 * one says "Manager" and "Office", so the same person was named two ways
 * depending on which part of the page you read.
 */
export function roleLabel(role: UserRole | string | null): string {
  switch (role) {
    case "platform_admin":
      return "Platform admin";
    case "org_admin":
      return "Manager";
    case "org_office":
      return "Office";
    case "learner":
      return "Learner";
    case "candidate":
      return "Applicant";
    default:
      return "No role";
  }
}

export interface UserContext {
  userId: string;
  email: string | null;
  /** From the JWT `user_role` claim (injected by custom_access_token_hook). */
  role: UserRole | null;
  /** From the JWT `organisation_id` claim. Null for platform_admin. */
  organisationId: string | null;
}

/** Landing route for each role. */
export function dashboardPathForRole(role: UserRole | null): string {
  switch (role) {
    case "platform_admin":
      return "/platform";
    case "org_admin":
    case "org_office":
      return "/org";
    case "learner":
      return "/learn";
    case "candidate":
      return "/my-application";
    default:
      // Authenticated but no profile/role yet (e.g. self-signup before invite).
      return "/dashboard";
  }
}

function normaliseClaim(value: unknown): string | null {
  if (value === null || value === undefined || value === "null") return null;
  return String(value);
}

/**
 * Returns the authenticated user plus their role/org claims, or null if not
 * signed in. getClaims() checks the access token's signature against the
 * project's public signing key (ES256, cached for 10 minutes), so this costs
 * no network call; getUser() asked the auth server every time, and a page ran
 * it three or four times (layout, page, shell). cache() makes it once per
 * request on top of that. A deactivated member is still caught by
 * assertActiveMember, which reads the database.
 */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: normaliseClaim(claims["user_role"]) as UserRole | null,
    organisationId: normaliseClaim(claims["organisation_id"]),
  };
});

/** Require an authenticated user; redirect to /login otherwise. */
export async function requireUser(): Promise<UserContext> {
  const context = await getUserContext();
  if (!context) redirect("/login");
  return context;
}

/** Roles that must complete MFA (AAL2) to use their console. */
const MFA_REQUIRED_ROLES: UserRole[] = ["platform_admin", "org_admin", "org_office"];

/**
 * Admins must be at AAL2. If they aren't (no factor enrolled, or enrolled but
 * not stepped up this session), send them to /mfa to enrol or verify.
 *
 * Toggle with MFA_ENFORCED: set it to "false" to disable enforcement (the /mfa
 * flow still works for anyone who opts in). Defaults to enforced.
 */
export const requireAdminMfa = cache(async (): Promise<void> => {
  if (process.env.MFA_ENFORCED === "false") return;

  const supabase = await createClient();
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return;
  if (data.currentLevel !== "aal2") redirect("/mfa");
});

/**
 * Blocks access for members whose account is deactivated or whose organisation
 * is suspended. platform_admin is global and unaffected. Degrades gracefully if
 * users.status doesn't exist yet (pre-migration).
 */
export async function assertActiveMember(context: UserContext): Promise<void> {
  if (context.role === "platform_admin") return;
  const member = await memberStatus(context.userId, context.organisationId);
  if (member.status === "deactivated") redirect("/suspended");
  if (member.orgStatus === "suspended") redirect("/suspended");
}

export interface MemberStatus {
  status: string | null;
  orgStatus: string | null;
  /** Read alongside status so the shell's "last active" write can skip
   *  itself when it would be a no-op — see DashboardShell. */
  lastSeenAt: string | null;
  /** For the person menu at the top of the page. */
  fullName: string | null;
}

/**
 * The member's own row and their organisation's status, once per request
 * (layout, page and shell all gate on it). Degrades gracefully: a missing
 * row reads as null, which blocks nothing.
 */
export const memberStatus = cache(
  async (userId: string, organisationId: string | null): Promise<MemberStatus> => {
    const supabase = await createClient();
    const [{ data: me }, { data: org }] = await Promise.all([
      supabase
        .from("users")
        .select("status, last_seen_at, full_name")
        .eq("id", userId)
        .maybeSingle(),
      organisationId
        ? supabase
            .from("organisations")
            .select("status")
            .eq("id", organisationId)
            .maybeSingle()
        : Promise.resolve({ data: null as { status?: string } | null }),
    ]);
    return {
      status: me?.status ?? null,
      orgStatus: org?.status ?? null,
      lastSeenAt: me?.last_seen_at ?? null,
      fullName: me?.full_name ?? null,
    };
  },
);

/**
 * Require a specific role. Authenticated users with the wrong role are sent to
 * their own dashboard. This is defence-in-depth over RLS, not a replacement.
 * Admin roles additionally require MFA (AAL2); org members are blocked if their
 * organisation is suspended.
 */
export async function requireRole(role: UserRole): Promise<UserContext> {
  const context = await requireUser();
  if (context.role !== role) redirect(dashboardPathForRole(context.role));
  if (MFA_REQUIRED_ROLES.includes(role)) await requireAdminMfa();
  if (role !== "platform_admin") await assertActiveMember(context);
  return context;
}

/**
 * Require any signed-in user, with the gates their own console would apply:
 * admins still have to be at AAL2, and a deactivated member or a suspended
 * organisation is still turned away.
 *
 * For /account — the one page every role shares, because everyone has a name
 * and a password of their own. Deliberately not requireUser(): without the
 * MFA check an admin could change their own password from a session that had
 * never stepped up.
 */
export async function requireActiveUser(): Promise<UserContext> {
  const context = await requireUser();
  if (context.role && MFA_REQUIRED_ROLES.includes(context.role)) {
    await requireAdminMfa();
  }
  await assertActiveMember(context);
  return context;
}

/** Require a candidate: someone signed in to follow their own application. */
export async function requireCandidate(): Promise<UserContext> {
  const context = await requireUser();
  if (context.role !== "candidate") redirect(dashboardPathForRole(context.role));
  return context;
}

/**
 * Require a member of staff — anyone with a company, for their own training
 * (/learn). A manager or office worker passes too, with the same MFA step
 * their console asks for, since it's the same session.
 */
export async function requireStaff(): Promise<UserContext> {
  const context = await requireUser();
  if (!isStaffRole(context.role) || !context.organisationId) redirect(dashboardPathForRole(context.role));
  if (isConsoleRole(context.role)) await requireAdminMfa();
  await assertActiveMember(context);
  return context;
}

/**
 * Require a console user — a manager or an office worker. Every org-side
 * page and action takes this; the Account page and the actions that change
 * who has console access keep requireRole("org_admin"). Same MFA and
 * active-member checks as requireRole.
 */
export async function requireConsole(): Promise<UserContext> {
  const context = await requireUser();
  if (!isConsoleRole(context.role)) redirect(dashboardPathForRole(context.role));
  await requireAdminMfa();
  await assertActiveMember(context);
  return context;
}

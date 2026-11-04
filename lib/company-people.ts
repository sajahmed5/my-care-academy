import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { createAccount } from "@/lib/invites";
import { sendInviteEmail } from "@/lib/email";
import { sendTrialWelcome } from "@/lib/trial-emails";
import { giveTemporaryPassword } from "@/lib/temporary-password";
import { ukDateKey } from "@/lib/trial";

/**
 * Adding a company's console people from the platform (ACCOUNT-ACCESS.md,
 * mock-up 6): several at once when a company is set up, or one at a time
 * later, each a manager or an office worker, each let in by email (the trial
 * welcome while a trial runs, else the invitation) or by a temporary password
 * shown once to whoever set them up.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type ConsoleRole = "org_admin" | "org_office";
export type Access = "email" | "password";

export interface NewPerson {
  name: string;
  email: string;
  role: ConsoleRole;
  access: Access;
}

export interface PersonOutcome {
  name: string;
  email: string;
  role: ConsoleRole;
  access: Access;
  ok: boolean;
  error?: string;
  /** By email: whether it went (it doesn't where sending is off). */
  emailed?: boolean;
  /** By email, when it didn't go: the set-up button's link, to pass on. */
  link?: string;
  /** By temporary password: shown once. */
  password?: string;
  /** The stored copy of the email, for "View email". */
  emailId?: string | null;
}

export const MAX_PEOPLE = 10;

export function roleWord(role: ConsoleRole): string {
  return role === "org_admin" ? "manager" : "office worker";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The people from a form: `personName`, `personEmail`, `personRole` and
 * `personAccess`, repeated in order. Blank rows are skipped.
 */
export function parsePeople(formData: FormData): { people: NewPerson[]; error?: string } {
  const names = formData.getAll("personName").map((v) => String(v).trim());
  const emails = formData.getAll("personEmail").map((v) => String(v).trim().toLowerCase());
  const roles = formData.getAll("personRole").map(String);
  const access = formData.getAll("personAccess").map(String);
  const people: NewPerson[] = [];
  for (let i = 0; i < emails.length; i++) {
    if (!emails[i] && !names[i]) continue;
    if (!EMAIL.test(emails[i] ?? "")) return { people, error: `Check the email address for ${names[i] || `person ${i + 1}`}.` };
    people.push({
      name: names[i] ?? "",
      email: emails[i],
      role: roles[i] === "org_office" ? "org_office" : "org_admin",
      access: access[i] === "password" ? "password" : "email",
    });
  }
  if (people.length === 0) return { people, error: "Add at least one person." };
  if (people.length > MAX_PEOPLE) return { people, error: `${MAX_PEOPLE} people at most here; add more from the company's page.` };
  if (new Set(people.map((p) => p.email)).size !== people.length) return { people, error: "The same email address is in the list twice." };
  return { people };
}

/** Which of these addresses already have an account (anywhere). */
export async function emailsInUse(admin: Admin, emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const { data } = await admin.from("users").select("email").in("email", emails);
  return (data ?? []).map((u) => (u.email as string).toLowerCase());
}

/** The newest stored copy for this account, for "View email". */
async function latestCopy(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("email_log")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Make one person's account and let them in. Never throws. */
export async function addCompanyPerson(
  admin: Admin,
  p: NewPerson,
  ctx: {
    orgId: string;
    orgName: string;
    /** While a trial runs: its first day (null when joining one already running) and end. */
    trial: { startsKey: string | null; endsAt: Date } | null;
    /** Everyone else in, for the trial welcome's "who else". */
    others: { name: string; roleLabel: string }[];
    sentBy: string;
  },
): Promise<PersonOutcome> {
  const base = { name: p.name || p.email, email: p.email, role: p.role, access: p.access };
  let userId: string;
  let setupLink: string;
  try {
    ({ userId, setupLink } = await createAccount({ email: p.email, role: p.role, organisationId: ctx.orgId, fullName: p.name }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return { ...base, ok: false, error: /already|registered|exists/i.test(message) ? "That email already has an account." : "The account couldn't be made." };
  }

  if (p.access === "password") {
    try {
      return { ...base, ok: true, password: await giveTemporaryPassword(admin, userId) };
    } catch {
      return { ...base, ok: false, error: "The account was made, but the password couldn't be set. Set one from the company's page." };
    }
  }

  const sent = ctx.trial
    ? await sendTrialWelcome({
        name: base.name,
        email: p.email,
        orgName: ctx.orgName,
        roleLabel: roleWord(p.role),
        startsKey: ctx.trial.startsKey,
        todayKey: ukDateKey(new Date()),
        endsAt: ctx.trial.endsAt,
        others: ctx.others,
        setupLink,
        organisationId: ctx.orgId,
        userId,
        sentBy: ctx.sentBy,
      })
    : (
        await sendInviteEmail({
          to: p.email,
          inviteUrl: setupLink,
          roleLabel: p.role === "org_admin" ? "a manager" : "an office worker",
          orgName: ctx.orgName,
          organisationId: ctx.orgId,
          userId,
          sentBy: ctx.sentBy,
        })
      ).sent;
  return { ...base, ok: true, emailed: sent, link: sent ? undefined : setupLink, emailId: await latestCopy(admin, userId) };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPasswordReset } from "@/lib/invites";
import { addCompanyPerson, emailsInUse, parsePeople, type PersonOutcome } from "@/lib/company-people";
import { consolePeople, sendTrialWelcome } from "@/lib/trial-emails";
import { trialState, ukDateKey } from "@/lib/trial";
import { sendInviteEmail } from "@/lib/email";
import { setupUrl } from "@/lib/account-setup";
import { siteOrigin } from "@/lib/site-url";
import { loadOrgEmail } from "@/lib/org-emails";
import { logAudit } from "@/lib/audit";
import { giveTemporaryPassword } from "@/lib/temporary-password";
import type { SaveState } from "@/app/platform/actions";

/**
 * Managing an organisation's admins from the platform side (issue #19). The
 * org's own admins can already invite and remove their staff; until now we
 * could not, so an organisation whose only admin had left was stuck.
 *
 * Every action re-checks that the target actually belongs to the organisation
 * in the URL. These run as the service role, so nothing else is stopping a
 * crafted id from reaching into another tenant.
 *
 * A role change lands in public.users, which is where custom_access_token_hook
 * reads from — so it applies when that person's token next refreshes, not
 * instantly in their open tab.
 */

async function assertInOrg(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  orgId: string,
) {
  const { data } = await admin
    .from("users")
    .select("id, email, role, organisation_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data || data.organisation_id !== orgId) return null;
  return data;
}

export interface AddPersonState {
  ok?: boolean;
  error?: string;
  outcome?: PersonOutcome;
}

/**
 * Add a manager or office worker to this organisation (ACCOUNT-ACCESS.md),
 * let in by email (the trial welcome while its trial runs, naming who's
 * already in; else the invitation) or a temporary password shown once.
 */
export async function inviteOrgAdminAction(
  _prev: AddPersonState,
  formData: FormData,
): Promise<AddPersonState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return { ok: false, error: "Missing organisation." };
  const { people, error } = parsePeople(formData);
  if (error || people.length !== 1) return { ok: false, error: error ?? "Add one person at a time here." };
  const person = people[0];

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organisations")
    .select("name, trial_ends_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "Organisation not found." };
  if ((await emailsInUse(admin, [person.email])).length > 0) return { ok: false, error: `${person.email} already has an account.` };

  const trial = trialState(org.trial_ends_at as string | null);
  const outcome = await addCompanyPerson(admin, person, {
    orgId,
    orgName: org.name as string,
    trial: trial.kind === "active" ? { startsKey: null, endsAt: trial.endsAt } : null,
    others: trial.kind === "active" ? await consolePeople(admin, orgId) : [],
    sentBy: context.userId,
  });
  if (!outcome.ok) return { ok: false, error: outcome.error };
  await logAudit({
    context,
    organisationId: orgId,
    action: "org.admin_invited",
    entity: "user",
    detail: { email: person.email, organisationId: orgId, role: person.role, access: person.access },
  });
  revalidatePath(`/platform/organisations/${orgId}`);
  return { ok: true, outcome };
}

/** Move a person between learner, office worker and manager. */
export async function setOrgUserRoleAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (role !== "org_admin" && role !== "org_office" && role !== "learner") {
    return { ok: false, error: "Invalid role." };
  }

  const admin = createAdminClient();
  const target = await assertInOrg(admin, userId, orgId);
  if (!target) return { ok: false, error: "User not found in this organisation." };
  if (target.role === "platform_admin") {
    return { ok: false, error: "Platform admins can't be changed from here." };
  }

  // Don't strip an organisation of its last way in: an office worker cannot
  // open Account, so a manager is the only one who can add another.
  if (role !== "org_admin" && target.role === "org_admin") {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("role", "org_admin");
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "This is the organisation's only manager — make someone else a manager first.",
      };
    }
  }

  const { error } = await admin.from("users").update({ role }).eq("id", userId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    action: "org.user_role_changed",
    entity: "user",
    entityId: userId,
    detail: { email: target.email, from: target.role, to: role },
  });
  revalidatePath(`/platform/organisations/${orgId}`);
  return { ok: true };
}

/** Permanently remove a user from this organisation. */
export async function removeOrgUserAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (userId === context.userId) {
    return { ok: false, error: "You cannot delete your own account." };
  }

  const admin = createAdminClient();
  const target = await assertInOrg(admin, userId, orgId);
  if (!target) return { ok: false, error: "User not found in this organisation." };

  if (target.role === "org_admin") {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("role", "org_admin");
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "This is the organisation's only admin — invite a replacement first.",
      };
    }
  }

  // Deleting the auth user cascades to the profile and their training records.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    action: "org.user_removed",
    entity: "user",
    entityId: userId,
    detail: { email: target.email, role: target.role, organisationId: orgId },
  });
  revalidatePath(`/platform/organisations/${orgId}`);
  return { ok: true };
}

export interface TemporaryPasswordState {
  ok?: boolean;
  error?: string;
  password?: string;
}

/**
 * Give someone in this organisation a temporary password (ACCOUNT-ACCESS.md),
 * for when their invitation didn't arrive or didn't work. Returned once, to be
 * shown on screen; never emailed or stored. They choose their own on first
 * sign-in.
 */
export async function setTemporaryPasswordAction(
  _prev: TemporaryPasswordState,
  formData: FormData,
): Promise<TemporaryPasswordState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  const admin = createAdminClient();
  const target = await assertInOrg(admin, userId, orgId);
  if (!target) return { ok: false, error: "That person isn't in this organisation." };
  const { data: row } = await admin.from("users").select("status").eq("id", userId).maybeSingle();
  if (row?.status === "deactivated") return { ok: false, error: "Reactivate them first: a deactivated account can't sign in." };

  let password: string;
  try {
    password = await giveTemporaryPassword(admin, userId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The password couldn't be set." };
  }
  await logAudit({
    context,
    organisationId: orgId,
    action: "user.temporary_password_set",
    entity: "user",
    entityId: userId,
    detail: { email: target.email },
  });
  return { ok: true, password };
}

export interface ResendState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/**
 * "Send again with a fresh link", from an email on the Emails tab
 * (ACCOUNT-ACCESS.md). Someone who has never signed in gets the invitation
 * again, with a new 14-day button; anyone else a password reset.
 */
export async function resendAccountEmailAction(_prev: ResendState, formData: FormData): Promise<ResendState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");
  const emailId = String(formData.get("emailId") ?? "");
  const email = await loadOrgEmail(orgId, emailId);
  if (!email?.person) return { ok: false, error: "That person isn't in this organisation any more." };
  if (email.person.status === "deactivated") return { ok: false, error: "Reactivate them first: a deactivated account can't sign in." };

  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("name, trial_ends_at").eq("id", orgId).maybeSingle();
  const trial = trialState((org?.trial_ends_at as string | null) ?? null);
  try {
    if (!email.person.lastSeenAt && email.type === "trial_welcome" && trial.kind === "active") {
      const sent = await sendTrialWelcome({
        name: email.person.name,
        email: email.to,
        orgName: (org?.name as string | undefined) ?? "your company",
        roleLabel: email.person.role === "Manager" ? "manager" : "office worker",
        startsKey: null,
        todayKey: ukDateKey(new Date()),
        endsAt: trial.endsAt,
        others: await consolePeople(admin, orgId, [email.person.id]),
        setupLink: setupUrl(await siteOrigin(), email.person.id),
        organisationId: orgId,
        userId: email.person.id,
        sentBy: context.userId,
      });
      await logAudit({ context, organisationId: orgId, action: "user.invitation_resent", entity: "user", entityId: email.person.id });
      revalidatePath(`/platform/organisations/${orgId}`);
      return sent
        ? { ok: true, message: `The trial welcome went again to ${email.to}, with a new 14-day button.` }
        : { ok: false, error: "The email couldn't be sent. Set a temporary password instead." };
    }
    if (!email.person.lastSeenAt) {
      const result = await sendInviteEmail({
        to: email.to,
        inviteUrl: setupUrl(await siteOrigin(), email.person.id),
        roleLabel: email.person.role === "Manager" ? "a manager" : email.person.role === "Office worker" ? "an office worker" : "a carer",
        orgName: (org?.name as string | undefined) ?? null,
        organisationId: orgId,
        userId: email.person.id,
        sentBy: context.userId,
      });
      await logAudit({ context, organisationId: orgId, action: "user.invitation_resent", entity: "user", entityId: email.person.id });
      revalidatePath(`/platform/organisations/${orgId}`);
      return result.sent
        ? { ok: true, message: `Invitation sent again to ${email.to}, with a new 14-day button.` }
        : { ok: false, error: "The email couldn't be sent. Set a temporary password instead." };
    }
    const result = await createPasswordReset(email.to);
    await logAudit({ context, organisationId: orgId, action: "user.password_reset_sent", entity: "user", entityId: email.person.id });
    revalidatePath(`/platform/organisations/${orgId}`);
    return result.sent
      ? { ok: true, message: `They've signed in before, so a password reset went to ${email.to}.` }
      : { ok: false, error: "The email couldn't be sent. Set a temporary password instead." };
  } catch {
    return { ok: false, error: "The email couldn't be sent. Set a temporary password instead." };
  }
}

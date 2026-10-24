"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvite } from "@/lib/invites";
import { logAudit } from "@/lib/audit";
import type { InviteState, SaveState } from "@/app/platform/actions";

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

/** Invite a new org admin into this organisation. */
export async function inviteOrgAdminAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!orgId) return { ok: false, error: "Missing organisation." };
  if (!email) return { ok: false, error: "Email is required." };

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organisations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "Organisation not found." };

  try {
    const result = await createInvite({
      email,
      role: "org_admin",
      organisationId: orgId,
      fullName: name,
      orgName: org.name,
      roleLabel: "an organisation admin",
    });
    await logAudit({
      context,
      action: "org.admin_invited",
      entity: "user",
      detail: { email, organisationId: orgId },
    });
    revalidatePath(`/platform/organisations/${orgId}`);
    return {
      ok: true,
      sent: result.sent,
      link: result.sent ? undefined : result.link,
      email,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send invite.",
    };
  }
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

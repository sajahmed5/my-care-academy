"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type UserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import type { SaveState } from "@/app/platform/actions";

/**
 * Who has console access (Saj, 24 Oct 2026). Managers only: an office worker
 * cannot reach the Account page, and these run as the service role, so each
 * one re-checks the target belongs to the caller's organisation.
 *
 * A role change lands in public.users, which is where the JWT hook reads it,
 * so it applies when that person's token next refreshes — not instantly in a
 * tab they already have open.
 */

const CONSOLE_TARGETS: UserRole[] = ["org_admin", "org_office"];

async function managerCount(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<number> {
  const { count } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", orgId)
    .eq("role", "org_admin")
    .eq("status", "active");
  return count ?? 0;
}

/** Change a console user's role: manager, office worker, or back to learner. */
export async function setConsoleRoleAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRole("org_admin");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;
  if (!["org_admin", "org_office", "learner"].includes(role)) {
    return { ok: false, error: "Invalid role." };
  }
  if (userId === context.userId) {
    return { ok: false, error: "You cannot change your own role — ask another manager." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("email, role, organisation_id")
    .eq("id", userId)
    .maybeSingle();
  if (!target || target.organisation_id !== context.organisationId) {
    return { ok: false, error: "Not found in your organisation." };
  }
  if (!CONSOLE_TARGETS.includes(target.role as UserRole)) {
    return { ok: false, error: "Only console users can be changed here." };
  }
  if (target.role === role) return { ok: true };

  // Never leave the organisation without a manager — nobody else can add one.
  if (target.role === "org_admin" && role !== "org_admin") {
    if ((await managerCount(admin, context.organisationId!)) <= 1) {
      return { ok: false, error: "This is your only other manager — make someone else a manager first." };
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
  revalidatePath("/org/billing");
  revalidatePath("/org/learners");
  return { ok: true };
}

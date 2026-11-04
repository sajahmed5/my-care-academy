"use server";

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { giveTemporaryPassword } from "@/lib/temporary-password";
import { logAudit } from "@/lib/audit";

export interface StaffPasswordState {
  ok?: boolean;
  error?: string;
  password?: string;
}

/**
 * A manager gives one of their own staff a temporary password
 * (ACCOUNT-ACCESS.md): managers only, never for themselves, and only someone
 * active in their own company. Runs as the service role, so every one of
 * those checks is made here. Returned once, to be shown on screen.
 */
export async function setStaffTemporaryPasswordAction(
  _prev: StaffPasswordState,
  formData: FormData,
): Promise<StaffPasswordState> {
  const context = await requireRole("org_admin");
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === context.userId) {
    return { ok: false, error: "You can't set a temporary password for yourself. Use your own account page to change it." };
  }

  const admin = createAdminClient();
  const { data: person } = await admin
    .from("users")
    .select("organisation_id, role, status, email")
    .eq("id", userId)
    .maybeSingle();
  if (!person || person.organisation_id !== context.organisationId || !["learner", "org_office", "org_admin"].includes(person.role as string)) {
    return { ok: false, error: "That person isn't in your company." };
  }
  if (person.status === "deactivated") {
    return { ok: false, error: "Reactivate them first: a deactivated account can't sign in." };
  }

  let password: string;
  try {
    password = await giveTemporaryPassword(admin, userId);
  } catch {
    return { ok: false, error: "The password couldn't be set. Try again." };
  }
  await logAudit({
    context,
    action: "user.temporary_password_set",
    entity: "user",
    entityId: userId,
    detail: { email: person.email },
  });
  return { ok: true, password };
}

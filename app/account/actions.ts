"use server";

import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPasswordReset } from "@/lib/invites";

/**
 * Your own sign-in details, whoever you are.
 *
 * Both actions take requireActiveUser(): a name and a password belong to the
 * person, not to the role. They were a manager's (requireRole("org_admin"))
 * and a learner's (requireRole("learner")) separately, which left an office
 * worker and a platform admin with nowhere to change either.
 */

/**
 * Change your own display name. Runs as the service role, so the
 * `.eq("id", context.userId)` is the whole guard — the caller never says
 * whose row to write.
 */
export async function updateMyNameAction(
  fullName: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireActiveUser();
  const name = fullName.trim();
  if (!name) return { ok: false, error: "Name can't be empty." };
  if (name.length > 120) return { ok: false, error: "That name is too long." };

  const { error } = await createAdminClient()
    .from("users")
    .update({ full_name: name })
    .eq("id", context.userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/account");
  return { ok: true };
}

/** Email yourself a password-reset link, for anyone who would rather have one. */
export async function sendMyPasswordResetAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const context = await requireActiveUser();
  if (!context.email) return { ok: false, error: "No email on your account." };
  try {
    await createPasswordReset(context.email);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not send the reset email.",
    };
  }
}

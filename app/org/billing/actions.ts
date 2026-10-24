"use server";

import { revalidatePath } from "next/cache";
import { requireConsole, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPasswordReset } from "@/lib/invites";

// Plan changes are owner-only (design doc v2): the self-serve checkout and
// Stripe portal actions were removed — org admins see billing read-only, and
// upgrades/downgrades happen through the platform owner.

export interface ResetState {
  ok?: boolean;
  error?: string;
}

/** Email the signed-in org admin a password-reset link for their own account. */
export async function sendMyPasswordResetAction(): Promise<ResetState> {
  const context = await requireRole("org_admin");
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

/**
 * Change your own display name.
 *
 * requireConsole, not requireRole("org_admin"): changing your own name is not
 * a manager's privilege, and the manager-only line is drawn at the Account
 * page itself (AGENTS.md). Scoped to the caller's own row — this runs as the
 * service role, so the `.eq("id", context.userId)` is the whole guard.
 */
export async function updateMyNameAction(
  fullName: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  const name = fullName.trim();
  if (!name) return { ok: false, error: "Name can't be empty." };
  if (name.length > 120) return { ok: false, error: "That name is too long." };

  const { error } = await createAdminClient()
    .from("users")
    .update({ full_name: name })
    .eq("id", context.userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/org/billing");
  return { ok: true };
}

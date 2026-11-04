"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { clearTemporaryPassword } from "@/lib/temporary-password";
import { onTemporaryPassword } from "@/lib/temporary-password-claim";
import { logAudit } from "@/lib/audit";

/**
 * Called by the form once the person has saved a password of their own (the
 * browser's updateUser, which also refuses the temporary one again). Clears
 * the temporary-password mark; the form then refreshes the session so the
 * new token no longer carries it.
 */
export async function finishTemporaryPasswordAction(): Promise<{ ok: boolean }> {
  const context = await requireUser();
  const { data } = await (await createClient()).auth.getClaims();
  if (!onTemporaryPassword(data?.claims)) return { ok: true };
  try {
    await clearTemporaryPassword(createAdminClient(), context.userId);
  } catch {
    return { ok: false };
  }
  await logAudit({ context, action: "user.temporary_password_replaced", entity: "user", entityId: context.userId });
  return { ok: true };
}

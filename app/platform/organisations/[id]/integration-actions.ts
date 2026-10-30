"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { issueKey, liveKeys, revokeKey } from "@/lib/integration-keys";

/**
 * Issuing an organisation's MyRoster key (myroster.care) on its Integration
 * tab. Since 31 Oct 2026 the company's managers do this themselves in
 * Settings; a platform admin can still do it here for them.
 *
 * Issuing replaces any key the organisation already had: the old one stops
 * working at once. The new key is returned to be shown once and is never
 * stored; only its hash is. The audit row records that a key was issued or
 * revoked, never the key.
 */
export async function issueIntegrationKeyAction(
  orgId: string,
): Promise<{ ok: boolean; key?: string; error?: string }> {
  const context = await requireRole("platform_admin");
  const { data: org } = await createAdminClient().from("organisations").select("id").eq("id", orgId).maybeSingle();
  if (!org) return { ok: false, error: "Organisation not found." };

  try {
    const { key, replaced } = await issueKey({ organisationId: orgId, system: "myroster", label: "MyRoster", actorId: context.userId });
    await logAudit({
      context,
      organisationId: orgId,
      action: replaced ? "integration_key.replaced" : "integration_key.issued",
      entity: "organisation",
      entityId: orgId,
    });
    revalidatePath(`/platform/organisations/${orgId}`);
    return { ok: true, key };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not issue a key." };
  }
}

/** Switch the organisation's MyRoster key off. The portal's next call is refused. */
export async function revokeIntegrationKeyAction(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("platform_admin");
  const key = (await liveKeys(orgId)).find((k) => k.system === "myroster");
  if (key) await revokeKey({ organisationId: orgId, keyId: key.id, actorId: context.userId });
  await logAudit({ context, organisationId: orgId, action: "integration_key.revoked", entity: "organisation", entityId: orgId });
  revalidatePath(`/platform/organisations/${orgId}`);
  return { ok: true };
}

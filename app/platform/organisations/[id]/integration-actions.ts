"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { newIntegrationKey } from "@/lib/portal-api";

/**
 * Issuing an organisation's rostering-integration key (myroster.care). It was
 * a script and a hand-run UPDATE; platform admins now do it here, and only
 * they — decided with Saj, 25 Oct 2026.
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
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organisations")
    .select("id, integration_key_hash")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "Organisation not found." };

  const { key, hash } = newIntegrationKey();
  const { error } = await admin
    .from("organisations")
    .update({
      integration_key_hash: hash,
      integration_key_created_at: new Date().toISOString(),
      integration_key_last_used_at: null,
    })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    organisationId: orgId,
    action: org.integration_key_hash ? "integration_key.replaced" : "integration_key.issued",
    entity: "organisation",
    entityId: orgId,
  });
  revalidatePath(`/platform/organisations/${orgId}`);
  return { ok: true, key };
}

/** Switch the organisation's key off. The portal's next call is refused. */
export async function revokeIntegrationKeyAction(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("platform_admin");
  const admin = createAdminClient();
  const { error } = await admin
    .from("organisations")
    .update({ integration_key_hash: null, integration_key_created_at: null, integration_key_last_used_at: null })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, organisationId: orgId, action: "integration_key.revoked", entity: "organisation", entityId: orgId });
  revalidatePath(`/platform/organisations/${orgId}`);
  return { ok: true };
}

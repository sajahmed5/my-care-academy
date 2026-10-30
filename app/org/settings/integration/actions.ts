"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { issueKey, revokeKey, type IntegrationSystem } from "@/lib/integration-keys";

const NOT_IN_PLAN = "The rostering integration is not included in your package.";

export type KeyState = { ok?: boolean; error?: string; key?: string };

/**
 * Connect MyRoster, or another system, with a new key (INTEGRATION-WHITE-
 * LABEL.md, 29 Oct 2026). Managers only. For MyRoster this replaces the
 * company's key, which stops working at once; another system's is added.
 * The key comes back to be shown once.
 */
export async function issueKeyAction(system: IntegrationSystem, label?: string): Promise<KeyState> {
  const context = await requireRole("org_admin");
  if (!(await hasFeature(context, "platform.portal_api"))) return { ok: false, error: NOT_IN_PLAN };
  const name = system === "myroster" ? "MyRoster" : (label ?? "").trim().slice(0, 80);
  if (!name) return { ok: false, error: "Say which system the key is for." };
  try {
    const { key, id, replaced } = await issueKey({
      organisationId: context.organisationId!,
      system,
      label: name,
      actorId: context.userId,
    });
    await logAudit({
      context,
      action: replaced ? "integration_key.replaced" : "integration_key.issued",
      entity: "integration_key",
      entityId: id,
      detail: { system, label: name },
    });
    revalidatePath("/org/settings/integration", "layout");
    return { ok: true, key };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not issue a key." };
  }
}

/** Disconnect: the key stops working at once. */
export async function revokeKeyAction(keyId: string): Promise<KeyState> {
  const context = await requireRole("org_admin");
  const system = await revokeKey({ organisationId: context.organisationId!, keyId, actorId: context.userId });
  if (!system) return { ok: false, error: "That key has already been switched off." };
  await logAudit({ context, action: "integration_key.revoked", entity: "integration_key", entityId: keyId, detail: { system } });
  revalidatePath("/org/settings/integration", "layout");
  return { ok: true };
}

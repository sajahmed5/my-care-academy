"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { issueKey, revokeKey, type IntegrationSystem } from "@/lib/integration-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALERT_EVENTS, checkAlertUrl, newAlertSecret } from "@/lib/alert-signing";
import { sendTestAlert } from "@/lib/alerts";

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

export type AlertState = { ok?: boolean; error?: string; secret?: string };

/**
 * An address another system has given for alerts. The secret alerts are
 * signed with comes back to be shown once (lib/alert-signing).
 */
export async function addAlertEndpointAction(_prev: AlertState, formData: FormData): Promise<AlertState> {
  const context = await requireRole("org_admin");
  if (!(await hasFeature(context, "platform.portal_api"))) return { ok: false, error: NOT_IN_PLAN };
  const label = String(formData.get("label") ?? "").trim().slice(0, 80);
  if (!label) return { ok: false, error: "Say which system the alerts are for." };
  const checked = checkAlertUrl(String(formData.get("url") ?? ""), process.env.NODE_ENV === "production");
  if (!checked.ok) return { ok: false, error: checked.error };
  const events = ALERT_EVENTS.map((e) => e.key).filter((k) => formData.get(`event:${k}`) === "on");
  if (!events.length) return { ok: false, error: "Choose at least one alert." };
  const secret = newAlertSecret();
  const { data, error } = await createAdminClient()
    .from("alert_endpoints")
    .insert({ organisation_id: context.organisationId, label, url: checked.url, secret, events, created_by: context.userId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save the address." };
  await logAudit({ context, action: "alert_endpoint.added", entity: "alert_endpoint", entityId: data.id as string, detail: { label, events } });
  revalidatePath("/org/settings/integration/other");
  return { ok: true, secret };
}

/** Pause or resume alerts to one address, or remove it. */
export async function setAlertEndpointAction(endpointId: string, change: "pause" | "resume" | "remove"): Promise<KeyState> {
  const context = await requireRole("org_admin");
  const admin = createAdminClient();
  const table = admin.from("alert_endpoints");
  const { error } = await (change === "remove"
    ? table.delete()
    : table.update({ active: change === "resume", consecutive_failures: 0 })
  )
    .eq("id", endpointId)
    .eq("organisation_id", context.organisationId!);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: `alert_endpoint.${change}d`, entity: "alert_endpoint", entityId: endpointId });
  revalidatePath("/org/settings/integration/other");
  return { ok: true };
}

/** A test alert, to check the other system is receiving them. */
export async function sendTestAlertAction(endpointId: string): Promise<KeyState> {
  const context = await requireRole("org_admin");
  if (!(await hasFeature(context, "platform.portal_api"))) return { ok: false, error: NOT_IN_PLAN };
  const ok = await sendTestAlert(endpointId, context.organisationId!);
  revalidatePath("/org/settings/integration/other");
  return ok ? { ok: true } : { ok: false, error: "It didn't get through. The list below says why." };
}

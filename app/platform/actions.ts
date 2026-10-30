"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvite } from "@/lib/invites";
import { logAudit } from "@/lib/audit";
import {
  PACKAGE_TIERS,
  ORG_STATUSES,
  SERVICE_TYPES,
  SIZE_BANDS,
} from "@/lib/organisations";
import { FEATURES } from "@/lib/features";
import {
  overrideChanges,
  type OverrideChoice,
} from "@/lib/org-subscription";

export interface InviteState {
  ok?: boolean;
  error?: string;
  /** Present when email isn't configured — shown as a copyable link. */
  link?: string;
  sent?: boolean;
  email?: string;
}

/**
 * platform_admin invites a new organisation: creates the org and sends its
 * first org_admin an invite. Rolls the org back if the invite fails.
 */
export async function inviteOrganisationAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const context = await requireRole("platform_admin");

  const orgName = String(formData.get("orgName") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  const adminName = String(formData.get("adminName") ?? "").trim();
  const packageTier = String(formData.get("packageTier") ?? "");
  const serviceType = String(formData.get("serviceType") ?? "");
  const sizeBand = String(formData.get("sizeBand") ?? "");

  if (!orgName || !adminEmail) {
    return { ok: false, error: "Organisation name and admin email are required." };
  }
  if (!PACKAGE_TIERS.some((t) => t.value === packageTier)) {
    return { ok: false, error: "Choose a package." };
  }
  if (serviceType && !SERVICE_TYPES.some((t) => t.value === serviceType)) {
    return { ok: false, error: "Invalid service type." };
  }
  if (sizeBand && !SIZE_BANDS.some((b) => b.value === sizeBand)) {
    return { ok: false, error: "Invalid size band." };
  }

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("organisations")
    .insert({
      name: orgName,
      package_tier: packageTier,
      service_type: serviceType || null,
      size_band: sizeBand || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  try {
    const result = await createInvite({
      email: adminEmail,
      role: "org_admin",
      organisationId: org.id,
      fullName: adminName,
      orgName,
      roleLabel: "organisation administrator",
    });
    await logAudit({
      context,
      organisationId: org.id,
      action: "organisation.invited",
      entity: "organisation",
      entityId: org.id,
      detail: {
        package_tier: packageTier,
        service_type: serviceType || null,
        size_band: sizeBand || null,
      },
    });
    revalidatePath("/platform");
    revalidatePath("/platform/organisations");
    return {
      ok: true,
      sent: result.sent,
      link: result.sent ? undefined : result.link,
      email: adminEmail,
    };
  } catch (e) {
    // Invite failed (e.g. email already in use) — undo the org we just created.
    await admin.from("organisations").delete().eq("id", org.id);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send invite.",
    };
  }
}

export interface SaveState {
  ok?: boolean;
  error?: string;
}

/**
 * Save an organisation's settings: name, package, status, what kind of service
 * it is, its size band, the agreed monthly amount, and any feature exceptions.
 *
 * The old forms/recruitment/observations switches are gone. Each feature is now
 * "follow the package", "always on" or "always off", and only the last two
 * store anything — so a deliberate exception is recorded as one, with who set
 * it and when, instead of three switches that drifted free of the package with
 * no record of why.
 */
export async function updateOrganisationAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRole("platform_admin");

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const packageTier = String(formData.get("package_tier") ?? "");
  const status = String(formData.get("status") ?? "");
  const serviceType = String(formData.get("service_type") ?? "");
  const sizeBand = String(formData.get("size_band") ?? "");

  if (!id) return { ok: false, error: "Missing organisation id." };
  if (!name) return { ok: false, error: "Name is required." };
  if (!PACKAGE_TIERS.some((t) => t.value === packageTier)) {
    return { ok: false, error: "Invalid package tier." };
  }
  if (!ORG_STATUSES.some((s) => s.value === status)) {
    return { ok: false, error: "Invalid status." };
  }
  if (serviceType && !SERVICE_TYPES.some((t) => t.value === serviceType)) {
    return { ok: false, error: "Invalid service type." };
  }
  if (sizeBand && !SIZE_BANDS.some((b) => b.value === sizeBand)) {
    return { ok: false, error: "Invalid size band." };
  }
  // Core features are in every package and cannot be excepted.
  const desired: Record<string, OverrideChoice> = {};
  for (const feature of FEATURES) {
    if (feature.isCore) continue;
    const choice = String(formData.get(`feature:${feature.key}`) ?? "follow");
    if (choice !== "follow" && choice !== "on" && choice !== "off") {
      return { ok: false, error: "Invalid feature setting." };
    }
    desired[feature.key] = choice;
  }

  // Everything goes through RLS — only a platform_admin can write any of it.
  const supabase = await createClient();
  const [{ data: before }, { data: overrides }] = await Promise.all([
    supabase
      .from("organisations")
      .select("package_tier, status, size_band, service_type")
      .eq("id", id)
      .single(),
    supabase
      .from("organisation_features")
      .select("feature_key, enabled")
      .eq("organisation_id", id),
  ]);
  if (!before) return { ok: false, error: "That organisation no longer exists." };

  const { error } = await supabase
    .from("organisations")
    .update({
      name,
      package_tier: packageTier,
      status,
      service_type: serviceType || null,
      size_band: sizeBand || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const { set, clear } = overrideChanges(
    (overrides ?? []).map((o) => ({
      feature: o.feature_key as string,
      enabled: o.enabled as boolean,
    })),
    desired,
  );
  const stamp = `Set by ${context.email ?? "a platform admin"} on ${new Date()
    .toISOString()
    .slice(0, 10)}`;
  if (set.length) {
    const { error: setError } = await supabase.from("organisation_features").upsert(
      set.map((s) => ({
        organisation_id: id,
        feature_key: s.feature,
        enabled: s.enabled,
        note: stamp,
      })),
      { onConflict: "organisation_id,feature_key" },
    );
    if (setError) return { ok: false, error: setError.message };
  }
  if (clear.length) {
    const { error: clearError } = await supabase
      .from("organisation_features")
      .delete()
      .eq("organisation_id", id)
      .in("feature_key", clear);
    if (clearError) return { ok: false, error: clearError.message };
  }

  // A manager's request for this package is answered by setting it. Written
  // as the service role: signed-in users can only read and add requests.
  await createAdminClient()
    .from("package_change_requests")
    .update({ status: "done", handled_at: new Date().toISOString() })
    .eq("organisation_id", id)
    .eq("to_tier", packageTier)
    .eq("status", "open");

  await logAudit({
    context,
    organisationId: id,
    action: "organisation.updated",
    entity: "organisation",
    entityId: id,
    detail: {
      package_tier: packageTier,
      status,
      service_type: serviceType || null,
      size_band: sizeBand || null,
      ...(set.length && { exceptions_set: set }),
      ...(clear.length && { exceptions_cleared: clear }),
    },
  });

  revalidatePath("/platform");
  revalidatePath(`/platform/organisations/${id}`);
  return { ok: true };
}

/** Invite another platform_admin (global, no organisation). */
export async function invitePlatformAdminAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  await requireRole("platform_admin");

  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!email) return { ok: false, error: "Email is required." };

  try {
    const result = await createInvite({
      email,
      role: "platform_admin",
      organisationId: null,
      fullName: name,
      roleLabel: "platform administrator",
    });
    revalidatePath("/platform");
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

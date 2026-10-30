"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { PACKAGE_TIERS } from "@/lib/organisations";
import { extendedTrialEnd, trialEndFrom, ukDateKey } from "@/lib/trial";
import type { SaveState } from "@/app/platform/actions";

/**
 * A company's free trial, from its page in the platform console (TRIAL.md).
 * Written through RLS: only a platform admin can update an organisation.
 */

function done(orgId: string) {
  revalidatePath("/platform");
  revalidatePath("/platform/organisations");
  revalidatePath(`/platform/organisations/${orgId}`);
}

/**
 * Seven days of Enterprise from the day given (today unless set ahead, so a
 * company can be made ready before it starts), ending at the end of the 7th.
 */
export async function startTrialAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");
  const start = String(formData.get("start") ?? "") || ukDateKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { ok: false, error: "Choose the day it starts." };
  if (start < ukDateKey(new Date())) return { ok: false, error: "A trial can't start in the past." };

  const endsAt = trialEndFrom(start);
  const supabase = await createClient();
  const { error } = await supabase
    .from("organisations")
    .update({ package_tier: "full", status: "active", trial_ends_at: endsAt.toISOString() })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    organisationId: orgId,
    action: "organisation.trial_started",
    entity: "organisation",
    entityId: orgId,
    detail: { starts: start, ends_at: endsAt.toISOString() },
  });
  done(orgId);
  return { ok: true };
}

/** Another seven days on the current end, or from today if it has passed. */
export async function extendTrialAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");

  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations").select("trial_ends_at").eq("id", orgId).maybeSingle();
  if (!org?.trial_ends_at) return { ok: false, error: "This organisation isn't on a trial." };

  const current = new Date(org.trial_ends_at as string);
  const endsAt = current.getTime() > Date.now() ? extendedTrialEnd(current) : trialEndFrom(ukDateKey(new Date()));
  const { error } = await supabase.from("organisations").update({ trial_ends_at: endsAt.toISOString() }).eq("id", orgId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    organisationId: orgId,
    action: "organisation.trial_extended",
    entity: "organisation",
    entityId: orgId,
    detail: { from: current.toISOString(), ends_at: endsAt.toISOString() },
  });
  done(orgId);
  return { ok: true };
}

/** They're carrying on: the package they chose, and no end date. */
export async function convertTrialAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");
  const tier = String(formData.get("tier") ?? "");
  if (!PACKAGE_TIERS.some((t) => t.value === tier)) return { ok: false, error: "Choose a package." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organisations")
    .update({ package_tier: tier, status: "active", trial_ends_at: null })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };

  // Their request for this package, from the trial-ended page or the Account
  // page, is answered. As the service role, as the settings form does.
  await createAdminClient()
    .from("package_change_requests")
    .update({ status: "done", handled_at: new Date().toISOString() })
    .eq("organisation_id", orgId)
    .eq("status", "open");

  await logAudit({
    context,
    organisationId: orgId,
    action: "organisation.trial_converted",
    entity: "organisation",
    entityId: orgId,
    detail: { package_tier: tier },
  });
  done(orgId);
  return { ok: true };
}

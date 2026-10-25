"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { removeOrganisation } from "@/lib/org-removal";
import type { SaveState } from "@/app/platform/actions";

/**
 * Remove an organisation that has left, with everything it holds
 * (lib/org-removal.ts). Platform admins only, and only once the organisation
 * is Suspended — a live customer cannot be removed by a slip — with its name
 * typed back to confirm which one.
 */
export async function removeOrganisationAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const orgId = String(formData.get("orgId") ?? "");
  const typed = String(formData.get("confirmName") ?? "").trim();

  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("name, status").eq("id", orgId).maybeSingle();
  if (!org) return { ok: false, error: "That organisation no longer exists." };
  if (org.status !== "suspended") {
    return { ok: false, error: "Set the organisation to Suspended first. Only an organisation that has left can be removed." };
  }
  if (typed !== org.name) return { ok: false, error: "Type the organisation's name exactly as shown to confirm." };

  let summary;
  try {
    summary = await removeOrganisation(admin, orgId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The removal did not finish." };
  }

  // The organisation's own audit rows go with it; this one records that it went.
  await logAudit({
    context,
    organisationId: null,
    action: "organisation.removed",
    entity: "organisation",
    entityId: orgId,
    detail: { name: summary.name, accounts: summary.accounts, files: summary.files, fileFailures: summary.fileFailures },
  });

  revalidatePath("/platform");
  revalidatePath("/platform/organisations");
  redirect("/platform/organisations");
}

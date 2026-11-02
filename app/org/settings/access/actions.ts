"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { AREA_KEYS, sanitiseHiddenAreas } from "@/lib/office-access";

/**
 * Who can see what (Saj, 2 Nov 2026): which areas of the console the
 * company's office workers can open. Managers only, like every settings
 * page (AGENTS.md). Takes effect on their next page.
 */
export async function saveOfficeAccessAction(input: { hidden: string[] }): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("org_admin");
  if (!Array.isArray(input?.hidden) || input.hidden.some((k) => typeof k !== "string" || !AREA_KEYS.has(k))) {
    return { ok: false, error: "That didn't save. Reload the page and try again." };
  }
  const hidden = sanitiseHiddenAreas(input.hidden);
  const admin = createAdminClient();
  const { error } = await admin.from("organisations").update({ office_hidden_areas: hidden }).eq("id", context.organisationId!);
  if (error) return { ok: false, error: "The settings couldn't be saved. Try again." };
  await logAudit({ context, action: "org.office_access_saved", entity: "organisation", entityId: context.organisationId!, detail: { hidden } });
  revalidatePath("/org/settings/access");
  revalidatePath("/org", "layout");
  return { ok: true };
}

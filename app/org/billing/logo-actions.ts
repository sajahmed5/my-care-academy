"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { LOGO_BUCKET, LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/branding";
import type { SaveState } from "@/app/platform/actions";

/**
 * The organisation's logo, set by a manager on the Account page (white-label,
 * ROADMAP §2). Written as the service role into a public bucket; the
 * previous file goes when a new one replaces it, so the bucket holds one logo
 * per organisation.
 */
export async function uploadOrgLogoAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("org_admin");
  const orgId = context.organisationId!;
  const admin = createAdminClient();
  if (!(await hasFeatureForOrg(admin, orgId, "platform.white_label"))) {
    return { ok: false, error: "Your own logo is not included in your package." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a logo to upload." };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a PNG or JPEG image." };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: "Keep the logo under 512 KB." };

  const { data: org } = await admin.from("organisations").select("white_label_logo").eq("id", orgId).maybeSingle();
  const path = `${orgId}/logo-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (upErr) return { ok: false, error: upErr.message };

  const { error } = await admin.from("organisations").update({ white_label_logo: path }).eq("id", orgId);
  if (error) {
    await admin.storage.from(LOGO_BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }
  const previous = org?.white_label_logo as string | null;
  if (previous && previous !== path) await admin.storage.from(LOGO_BUCKET).remove([previous]);

  await logAudit({ context, action: "organisation.logo_set", entity: "organisation", entityId: orgId });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeOrgLogoAction(): Promise<SaveState> {
  const context = await requireRole("org_admin");
  const orgId = context.organisationId!;
  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("white_label_logo").eq("id", orgId).maybeSingle();
  const previous = org?.white_label_logo as string | null;
  const { error } = await admin.from("organisations").update({ white_label_logo: null }).eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  if (previous) await admin.storage.from(LOGO_BUCKET).remove([previous]);
  await logAudit({ context, action: "organisation.logo_removed", entity: "organisation", entityId: orgId });
  revalidatePath("/", "layout");
  return { ok: true };
}

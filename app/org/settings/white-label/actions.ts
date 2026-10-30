"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { LOGO_BUCKET, LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/branding";
import { normaliseHex } from "@/lib/brand-colour";
import type { SaveState } from "@/app/platform/actions";

/**
 * The organisation's logo, set by a manager in Settings, White label (on
 * the Account page until 31 Oct 2026). Written as the service role into a
 * public bucket; the previous file goes when a new one replaces it, so the
 * bucket holds one logo per organisation.
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

/**
 * The company's colour, or our own again (null). Only a real colour is
 * stored; how readable it is decides how it's used (lib/brand-colour), never
 * whether it's allowed.
 */
export async function saveBrandColourAction(colour: string | null): Promise<SaveState> {
  const context = await requireRole("org_admin");
  const orgId = context.organisationId!;
  const admin = createAdminClient();
  if (!(await hasFeatureForOrg(admin, orgId, "platform.white_label"))) {
    return { ok: false, error: "Your own colour is not included in your package." };
  }
  const value = colour === null ? null : normaliseHex(colour);
  if (colour !== null && !value) return { ok: false, error: "That isn't a colour. Use the picker, or a code like #1d4ed8." };
  const { error } = await admin.from("organisations").update({ brand_colour: value }).eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: value ? "organisation.colour_set" : "organisation.colour_removed", entity: "organisation", entityId: orgId, detail: { colour: value } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Who the company's emails come from, and where replies go. A blank name is
 * the company's own; a blank address leaves replies as they were.
 */
export async function saveEmailSenderAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("org_admin");
  const orgId = context.organisationId!;
  const admin = createAdminClient();
  if (!(await hasFeatureForOrg(admin, orgId, "platform.white_label"))) {
    return { ok: false, error: "Emails in your name are not included in your package." };
  }
  const name = String(formData.get("senderName") ?? "").replace(/["\\<>\r\n]/g, "").trim().slice(0, 80) || null;
  const replyTo = String(formData.get("replyTo") ?? "").trim().toLowerCase() || null;
  if (replyTo && !/^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(replyTo)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  const { error } = await admin.from("organisations").update({ email_sender_name: name, email_reply_to: replyTo }).eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "organisation.email_sender_set", entity: "organisation", entityId: orgId, detail: { name, replyTo } });
  revalidatePath("/org/settings/white-label");
  return { ok: true };
}

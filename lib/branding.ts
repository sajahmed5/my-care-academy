import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";

/**
 * An organisation's own branding (white label, INTEGRATION-WHITE-LABEL.md):
 * its logo, on its certificates, its carers' portal and its copy of the
 * policies, and its colour on buttons and the menu (lib/brand-colour).
 *
 * Only when the package includes platform.white_label — a logo or colour set
 * under Enterprise stops showing if the organisation moves down, and comes
 * back if it moves up, without anyone deleting or re-uploading it.
 */

export const LOGO_BUCKET = "org-logos";
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

/** The public address of a logo held in the bucket. */
export function logoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}

export interface OrgBranding {
  name: string;
  /** Null without white-label, or with it but nothing uploaded yet. */
  logoUrl: string | null;
  /** "#1d4ed8"; null without white label, or for our own teal. */
  colour: string | null;
}

/** Once per request, however many places on the page ask. */
export const orgBranding = cache(async (organisationId: string | null | undefined): Promise<OrgBranding | null> => {
  if (!organisationId) return null;
  try {
    const admin = createAdminClient();
    const [{ data: org }, whiteLabel] = await Promise.all([
      admin.from("organisations").select("name, white_label_logo, brand_colour").eq("id", organisationId).maybeSingle(),
      hasFeatureForOrg(admin, organisationId, "platform.white_label"),
    ]);
    if (!org) return null;
    const path = org.white_label_logo as string | null;
    return {
      name: org.name as string,
      logoUrl: whiteLabel && path ? logoUrl(path) : null,
      colour: whiteLabel ? ((org.brand_colour as string | null) ?? null) : null,
    };
  } catch {
    return null;
  }
});

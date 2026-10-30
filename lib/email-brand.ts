import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { orgBranding } from "@/lib/branding";
import { hasFeatureForOrg } from "@/lib/entitlements";
import type { EmailBrand } from "@/lib/email-layout";

/**
 * How a company's emails go out, with white label (INTEGRATION-WHITE-
 * LABEL.md: "Emails as the company"): its logo and colour, its name as the
 * sender, and replies to its own address. Null without white label, and
 * then nothing about the email changes.
 *
 * The sending address stays ours: sending from the company's own domain
 * needs its IT to change settings, so that's set up on request.
 */
export interface CompanyEmail {
  brand: EmailBrand;
  senderName: string;
  replyTo: string | null;
}

export const companyEmail = cache(async (organisationId: string): Promise<CompanyEmail | null> => {
  const admin = createAdminClient();
  // orgBranding answers for every company (its logo and colour only with
  // white label), so white label is asked about here as well.
  const [branding, whiteLabel, { data: org }] = await Promise.all([
    orgBranding(organisationId),
    hasFeatureForOrg(admin, organisationId, "platform.white_label"),
    admin.from("organisations").select("email_sender_name, email_reply_to").eq("id", organisationId).maybeSingle(),
  ]);
  if (!branding || !whiteLabel) return null;
  return {
    brand: { name: branding.name, logoUrl: branding.logoUrl, colour: branding.colour },
    senderName: ((org?.email_sender_name as string | null) || branding.name).trim(),
    replyTo: (org?.email_reply_to as string | null) ?? null,
  };
});

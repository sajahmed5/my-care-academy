"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { emailButton, emailLayout, esc } from "@/lib/email-layout";
import { recheckDomain } from "@/lib/company-host";

/**
 * Switching a company's own web address on, once its DNS record is in place
 * and the address has been added to the Vercel project (Settings, Domains).
 * Adding it there stays a person's job: it's the live site's settings.
 * Its managers are told when it's on.
 */
export async function switchOnDomainAction(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("platform_admin");
  const check = await recheckDomain(orgId);
  if (!check) return { ok: false, error: "No address asked for." };
  if (!check.ok) return { ok: false, error: `The DNS record isn't in place yet${check.found ? ` (found ${check.found})` : ""}.` };
  const admin = createAdminClient();
  const { error } = await admin
    .from("organisations")
    .update({ custom_domain_status: "live", custom_domain_live_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, organisationId: orgId, action: "organisation.domain_live", entity: "organisation", entityId: orgId, detail: { domain: check.domain } });

  const { data: managers } = await admin
    .from("users")
    .select("email")
    .eq("organisation_id", orgId)
    .eq("role", "org_admin")
    .eq("status", "active");
  const url = `https://${check.domain}/login`;
  await Promise.all(
    (managers ?? [])
      .filter((m) => m.email)
      .map((m) =>
        sendEmail({
          to: m.email as string,
          organisationId: orgId,
          subject: `Your training is now at ${check.domain}`,
          html: emailLayout({
            heading: "Your own web address is live",
            body: `<p>Your staff now sign in at <strong>${esc(check.domain)}</strong>, and every email we send them links there.
              Anyone using the old address can carry on: they'll be asked to sign in once more at the new one.</p>
              ${emailButton(url, "Open it")}`,
            footer: "My Care Academy — sent because your web address was switched on.",
          }),
        }),
      ),
  );
  revalidatePath(`/platform/organisations/${orgId}`);
  return { ok: true };
}

/** Back to our address (the record can stay; nothing uses it). */
export async function switchOffDomainAction(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("platform_admin");
  const { error } = await createAdminClient()
    .from("organisations")
    .update({ custom_domain_status: "pending", custom_domain_live_at: null })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, organisationId: orgId, action: "organisation.domain_switched_off", entity: "organisation", entityId: orgId });
  revalidatePath(`/platform/organisations/${orgId}`);
  return { ok: true };
}

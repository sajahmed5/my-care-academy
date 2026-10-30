"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { emailLayout, esc } from "@/lib/email-layout";
import { normaliseDomain } from "@/lib/custom-domain";
import { recheckDomain } from "@/lib/company-host";
import type { SaveState } from "@/app/platform/actions";

const INBOX = process.env.CONTACT_INBOX ?? "hello@mycareacademy.co.uk";
const NOT_IN_PLAN = "Your own web address is included with white label, in Enterprise.";

/** Tell us: an address asked for, or its record now in place. */
async function tellUs(orgId: string, subject: string, body: string) {
  const { data: org } = await createAdminClient().from("organisations").select("name").eq("id", orgId).maybeSingle();
  await sendEmail({
    to: INBOX,
    subject: `${subject}: ${org?.name ?? "an organisation"}`,
    html: emailLayout({
      heading: subject,
      body: `<p><strong>${esc((org?.name as string) ?? "An organisation")}</strong>: ${body}</p>
        <p>Open the organisation's Integration tab in the platform console.</p>`,
      footer: "My Care Academy — sent from a manager's Settings.",
    }),
  });
}

/**
 * Ask for the company's own web address (INTEGRATION-WHITE-LABEL.md). It
 * waits for the company's DNS record and for us to switch it on; until then
 * nothing changes for its staff. Managers only.
 */
export async function requestDomainAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("org_admin");
  const orgId = context.organisationId!;
  const admin = createAdminClient();
  if (!(await hasFeatureForOrg(admin, orgId, "platform.white_label"))) return { ok: false, error: NOT_IN_PLAN };
  const parsed = normaliseDomain(String(formData.get("domain") ?? ""));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { data: taken } = await admin.from("organisations").select("id").eq("custom_domain", parsed.domain).neq("id", orgId).maybeSingle();
  if (taken) return { ok: false, error: "That address is already set up for another company." };
  const { error } = await admin
    .from("organisations")
    .update({
      custom_domain: parsed.domain,
      custom_domain_status: "pending",
      custom_domain_dns_ok: null,
      custom_domain_checked_at: null,
      custom_domain_requested_at: new Date().toISOString(),
      custom_domain_live_at: null,
    })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "organisation.domain_requested", entity: "organisation", entityId: orgId, detail: { domain: parsed.domain } });
  await tellUs(orgId, "Web address asked for", `wants ${esc(parsed.domain)}. Waiting for their DNS record.`);
  revalidatePath("/org/settings/white-label/domain");
  return { ok: true };
}

/** Check the company's DNS record now. The first time it's right, we're told. */
export async function checkDomainAction(): Promise<SaveState & { found?: string | null }> {
  const context = await requireRole("org_admin");
  const r = await recheckDomain(context.organisationId!);
  if (!r) return { ok: false, error: "Ask for an address first." };
  if (r.firstOk) await tellUs(context.organisationId!, "Web address ready to switch on", `the DNS record for ${esc(r.domain)} is in place. Add it to the Vercel project, then switch it on.`);
  revalidatePath("/org/settings/white-label/domain");
  return r.ok ? { ok: true, found: r.found } : { ok: false, found: r.found, error: "We can't see the record yet." };
}

/** Stop using the company's own address: its staff are back on ours at once. */
export async function cancelDomainAction(): Promise<SaveState> {
  const context = await requireRole("org_admin");
  const orgId = context.organisationId!;
  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("custom_domain, custom_domain_status").eq("id", orgId).maybeSingle();
  const { error } = await admin
    .from("organisations")
    .update({
      custom_domain: null,
      custom_domain_status: null,
      custom_domain_dns_ok: null,
      custom_domain_checked_at: null,
      custom_domain_requested_at: null,
      custom_domain_live_at: null,
    })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "organisation.domain_removed", entity: "organisation", entityId: orgId, detail: { domain: org?.custom_domain } });
  if (org?.custom_domain_status === "live") {
    await tellUs(orgId, "Web address no longer used", `has stopped using ${esc(org.custom_domain as string)}. Remove it from the Vercel project.`);
  }
  revalidatePath("/org/settings/white-label/domain");
  return { ok: true };
}

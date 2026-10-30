import "server-only";
import dns from "node:dns/promises";
import { cache } from "react";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { orgBranding } from "@/lib/branding";
import { A_RECORD_TARGET, isApex, isOurHost } from "@/lib/custom-domain";

/**
 * Which company's web address a request came in on, and the address a
 * company's links should use (lib/custom-domain says how it's set up). A
 * company's address only counts while it's live and the package includes
 * white label: moving down puts its staff back on ours.
 */

export interface HostCompany {
  id: string;
  name: string;
  domain: string;
  logoUrl: string | null;
  colour: string | null;
}

const OUR_SITE = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mycareacademy.co.uk").replace(/\/+$/, "");

/** The company whose live address this is, or null for one of ours. */
export const companyForDomain = cache(async (host: string | null): Promise<HostCompany | null> => {
  if (isOurHost(host, process.env.NEXT_PUBLIC_SITE_URL)) return null;
  const domain = host!.toLowerCase().replace(/:\d+$/, "");
  try {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organisations")
      .select("id, name")
      .eq("custom_domain", domain)
      .eq("custom_domain_status", "live")
      .maybeSingle();
    if (!org || !(await hasFeatureForOrg(admin, org.id as string, "platform.white_label"))) return null;
    const branding = await orgBranding(org.id as string);
    return {
      id: org.id as string,
      name: org.name as string,
      domain,
      logoUrl: branding?.logoUrl ?? null,
      colour: branding?.colour ?? null,
    };
  } catch {
    return null;
  }
});

/** The company whose address this request came in on, if any. */
export async function hostCompany(): Promise<HostCompany | null> {
  const h = await headers();
  return companyForDomain(h.get("x-forwarded-host") ?? h.get("host"));
}

/** Where our own site is, for sending someone back to it. */
export function ourSite(): string {
  return OUR_SITE();
}

/**
 * The origin a company's links use: https://its-address once it's live
 * (with white label), null for ours. Port and scheme kept for a local
 * test address, so a link sent from localhost opens on localhost.
 */
export const companyOrigin = cache(async (organisationId: string): Promise<string | null> => {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("organisations")
      .select("custom_domain, custom_domain_status")
      .eq("id", organisationId)
      .maybeSingle();
    if (!data?.custom_domain || data.custom_domain_status !== "live") return null;
    if (!(await hasFeatureForOrg(admin, organisationId, "platform.white_label"))) return null;
    const domain = data.custom_domain as string;
    if (domain.endsWith(".localhost")) {
      const h = await headers().catch(() => null);
      const port = (h?.get("host") ?? "").match(/:(\d+)$/)?.[1];
      return `http://${domain}${port ? `:${port}` : ""}`;
    }
    return `https://${domain}`;
  } catch {
    return null;
  }
});

/**
 * Whether the company's DNS record is in place: a CNAME to Vercel for an
 * address under its domain, the A record for a bare domain. A local test
 * address (*.localhost) always is.
 */
export async function dnsReady(domain: string): Promise<{ ok: boolean; found: string | null }> {
  if (domain.endsWith(".localhost")) return { ok: true, found: "this computer" };
  try {
    if (isApex(domain)) {
      const a = await dns.resolve4(domain);
      return { ok: a.includes(A_RECORD_TARGET), found: a.join(", ") || null };
    }
    const cname = await dns.resolveCname(domain).catch(() => [] as string[]);
    if (cname.length) {
      return { ok: cname.some((c) => c.replace(/\.$/, "").toLowerCase().endsWith("vercel-dns.com")), found: cname.join(", ") };
    }
    // Some providers flatten a CNAME into A records.
    const a = await dns.resolve4(domain).catch(() => [] as string[]);
    return { ok: a.includes(A_RECORD_TARGET), found: a.join(", ") || null };
  } catch {
    return { ok: false, found: null };
  }
}


/** Check a company's DNS record now, and keep the answer for its pages. */
export async function recheckDomain(organisationId: string): Promise<{ domain: string; ok: boolean; found: string | null; firstOk: boolean } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organisations")
    .select("custom_domain, custom_domain_dns_ok")
    .eq("id", organisationId)
    .maybeSingle();
  const domain = data?.custom_domain as string | null;
  if (!domain) return null;
  const result = await dnsReady(domain);
  await admin
    .from("organisations")
    .update({ custom_domain_dns_ok: result.ok, custom_domain_checked_at: new Date().toISOString() })
    .eq("id", organisationId);
  return { domain, ...result, firstOk: result.ok && !data?.custom_domain_dns_ok };
}

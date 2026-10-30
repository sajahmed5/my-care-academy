/**
 * A company's own web address (white label, INTEGRATION-WHITE-LABEL.md,
 * 29 Oct 2026): training.hgcare.co.uk, say. Its carers and office sign in
 * there, and every emailed link points there. Pure, for the settings page,
 * the proxy and the tests alike; lib/company-host does the lookups.
 *
 * How it's set up: a manager asks for the address, and adds one DNS record
 * at whoever runs the company's domain — a CNAME to Vercel for an address
 * like training.hgcare.co.uk, or an A record for a bare hgcare.co.uk. When
 * the record is in place, a platform admin adds the address to the Vercel
 * project and switches it on. Sign-in needs nothing more: emailed sign-in
 * links come back to our own /auth/confirm on whichever address they were
 * sent with, so Supabase Auth's redirect list isn't involved.
 */

export const CNAME_TARGET = "cname.vercel-dns.com";
export const A_RECORD_TARGET = "76.76.21.21";

/** Our own addresses, which are never a company's. */
const OUR_DOMAINS = ["mycareacademy.co.uk", "vercel.app", "vercel.com", "supabase.co"];

/** Second-level suffixes under which the registered domain has three labels. */
const TWO_PART_SUFFIXES = new Set(["co.uk", "org.uk", "ltd.uk", "plc.uk", "me.uk", "net.uk", "nhs.uk", "gov.uk", "ac.uk", "com.au", "co.nz"]);

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * What a manager typed, as an address: no https://, path, port or trailing
 * dot, lower case. An error in their words when it can't be one.
 */
export function normaliseDomain(input: string): { ok: true; domain: string } | { ok: false; error: string } {
  let v = input.trim().toLowerCase();
  v = v.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (!v) return { ok: false, error: "Type the address, like training.yourcompany.co.uk." };
  if (/^\d+(\.\d+){3}$/.test(v) || v.includes(":")) return { ok: false, error: "Use a name, like training.yourcompany.co.uk, not a number." };
  const labels = v.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !/^[a-z]{2,63}$/.test(labels[labels.length - 1])) {
    return { ok: false, error: "That isn't a web address. It looks like training.yourcompany.co.uk." };
  }
  if (OUR_DOMAINS.some((d) => v === d || v.endsWith(`.${d}`))) {
    return { ok: false, error: "That's one of our addresses. Use one on your own company's domain." };
  }
  return { ok: true, domain: v };
}

/** A bare domain (hgcare.co.uk) rather than an address under one. */
export function isApex(domain: string): boolean {
  const labels = domain.split(".");
  const suffix = labels.slice(-2).join(".");
  return labels.length <= (TWO_PART_SUFFIXES.has(suffix) ? 3 : 2);
}

/** The one record the company adds, as its domain provider asks for it. */
export function dnsRecord(domain: string): { type: "CNAME" | "A"; name: string; value: string } {
  if (isApex(domain)) return { type: "A", name: "@", value: A_RECORD_TARGET };
  const labels = domain.split(".");
  const suffix = labels.slice(-2).join(".");
  const zoneLabels = TWO_PART_SUFFIXES.has(suffix) ? 3 : 2;
  return { type: "CNAME", name: labels.slice(0, labels.length - zoneLabels).join("."), value: CNAME_TARGET };
}

/**
 * Whether a request's host is ours rather than a company's: the site's own
 * address, a Vercel preview, or this machine. Anything else may be a
 * company's address (and is looked up to find out).
 */
export function isOurHost(host: string | null | undefined, siteUrl?: string | null): boolean {
  if (!host) return true;
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
  if (OUR_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`))) return true;
  try {
    const site = siteUrl ? new URL(siteUrl).hostname : null;
    if (site && (h === site || h === site.replace(/^www\./, "") || `www.${h}` === site)) return true;
  } catch {
    // An unparseable site address says nothing either way.
  }
  return false;
}

/** The public site's pages, which a company's address doesn't show. */
const MARKETING = ["/training", "/care-training-manchester-stockport", "/contact", "/privacy", "/verify", "/developers", "/pricing"];

/**
 * Where a request on a company's address goes instead, if anywhere: its
 * home page is the sign-in screen, and our public pages — certificate
 * verification included, which stays on our own neutral site — open on our
 * address. Null to carry on.
 */
export function companyHostRedirect(pathname: string, siteUrl: string): string | null {
  if (pathname === "/") return "/login";
  if (MARKETING.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return `${siteUrl.replace(/\/+$/, "")}${pathname}`;
  }
  return null;
}

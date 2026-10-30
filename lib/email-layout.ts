/**
 * The frame every email to a carer or manager is sent in (28 Oct 2026).
 *
 * Each email had its own: the invite, password reset, sign-in nudge and "you
 * have been given…" emails had a black button and no logo; the reminders and
 * report emails a slate blue; none looked like the site. Now one card on the
 * site's pale page colour, the logo across the top over a teal line, the
 * site's teal for buttons, and a footer line saying why the email came.
 *
 * Inline styles and plain divs: email clients strip <style> blocks and most
 * of CSS. The logo is an absolute address on the live site, and its alt text
 * reads properly where images are blocked.
 */

import { mix, readableOnWhite } from "./brand-colour";

const TEAL = "#0f8178";
const TEXT = "#0f2a2e";
const MUTED = "#587070";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mycareacademy.co.uk").replace(/\/+$/, "");

/** Escape text for an HTML email body. */
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The one call to action, in the site's teal. */
export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:${TEAL};color:#ffffff;padding:12px 22px;border-radius:999px;font-weight:600;text-decoration:none">${label}</a></p>`;
}

/** A quoted block — a note from someone, or what the person told us. */
export function emailQuote(html: string): string {
  return `<div style="white-space:pre-wrap;border-left:3px solid ${TEAL};padding:8px 12px;background:#eef7f5;border-radius:0 8px 8px 0">${html}</div>`;
}

/** "If the button doesn't work" — for links that must work without it. */
export function emailLinkFallback(url: string): string {
  return `<p style="color:${MUTED};font-size:13px">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all">${url}</span></p>`;
}

/** Where brandEmailHtml finds the parts it swaps. Invisible in any client. */
const LOGO_START = "<!--mca:logo-->";
const LOGO_END = "<!--/mca:logo-->";
const FOOTER_START = "<!--mca:footer-->";
const FOOTER_END = "<!--/mca:footer-->";

export function emailLayout({
  heading,
  body,
  footer = "My Care Academy — automated notification.",
}: {
  /** Shown as the email's title inside the card; leave out for a letter. */
  heading?: string;
  body: string;
  /** Why this email came, under the card. */
  footer?: string;
}): string {
  return `<div style="background:#f5faf9;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dcebe8;border-radius:14px;overflow:hidden">
    <div style="padding:18px 28px;border-bottom:3px solid ${TEAL}">
      ${LOGO_START}<img src="${SITE}/logo.png" width="150" alt="My Care Academy" style="display:block;width:150px;height:auto;border:0;color:${TEAL};font-weight:700;font-size:18px">${LOGO_END}
    </div>
    <div style="padding:24px 28px;color:${TEXT};font-size:15px;line-height:1.55">
      ${heading ? `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${TEXT}">${heading}</h1>` : ""}${body}
    </div>
  </div>
  <p style="max-width:520px;margin:12px auto 0;color:${MUTED};font-size:12px;text-align:center">${FOOTER_START}${footer}${FOOTER_END}</p>
</div>`;
}

/** A company's look on an email, with white label (lib/email-brand). */
export interface EmailBrand {
  name: string;
  logoUrl: string | null;
  /** "#1d4ed8"; null keeps our teal. */
  colour: string | null;
}

/**
 * Dress an email built with emailLayout in a company's own logo and colour
 * (INTEGRATION-WHITE-LABEL.md: "the logo on every email"), with "Powered by
 * My Care Academy" kept as a small line at the foot. Without a logo the
 * company's name heads the email instead of ours. An email not built with
 * emailLayout is left as it is.
 *
 * The colour is used as brand-colour's readable shade, so white button text
 * on it always reaches 4.5 to 1.
 */
export function brandEmailHtml(html: string, brand: EmailBrand): string {
  const primary = brand.colour ? readableOnWhite(brand.colour) : TEAL;
  const head = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" style="display:block;max-width:220px;max-height:56px;height:auto;border:0;color:${primary};font-weight:700;font-size:18px">`
    : `<p style="margin:0;color:${TEXT};font-weight:700;font-size:18px">${esc(brand.name)}</p>`;
  let out = html.replace(new RegExp(`${LOGO_START}[\\s\\S]*?${LOGO_END}`), head);
  out = out.replace(new RegExp(`${FOOTER_START}([\\s\\S]*?)${FOOTER_END}`), (_m, footer: string) => {
    // "My Care Academy — sent for X." reads as X's email once it's in X's
    // dress; our name moves to the line under it.
    const own = footer.replace(/^My Care Academy\s+[—-]\s+(.)/, (_x, c: string) => c.toUpperCase());
    return `${own}<br><span style="font-size:11px">Powered by My Care Academy</span>`;
  });
  if (primary !== TEAL) {
    out = out.split(TEAL).join(primary).split("#eef7f5").join(mix(primary, "#ffffff", 0.92));
  }
  return out;
}

/**
 * Point an email's links at a company's own web address (white label:
 * "every link we send points there"). Links to any of our origins move,
 * apart from certificate verification, which stays on our own neutral site.
 */
export function pointLinksAt(html: string, ourOrigins: (string | null | undefined)[], companyOrigin: string): string {
  const to = companyOrigin.replace(/\/+$/, "");
  const froms = [...new Set(ourOrigins.filter((o): o is string => !!o).map((o) => o.replace(/\/+$/, "")))].filter((o) => o !== to);
  if (!froms.length) return html;
  const escaped = froms.map((o) => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return html.replace(new RegExp(`(${escaped})(?=/|"|<|\\s|$)(?!/verify)`, "g"), to);
}

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
      <img src="${SITE}/logo.png" width="150" alt="My Care Academy" style="display:block;width:150px;height:auto;border:0;color:${TEAL};font-weight:700;font-size:18px">
    </div>
    <div style="padding:24px 28px;color:${TEXT};font-size:15px;line-height:1.55">
      ${heading ? `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${TEXT}">${heading}</h1>` : ""}${body}
    </div>
  </div>
  <p style="max-width:520px;margin:12px auto 0;color:${MUTED};font-size:12px;text-align:center">${footer}</p>
</div>`;
}

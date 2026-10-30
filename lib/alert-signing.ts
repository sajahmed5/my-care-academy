import crypto from "node:crypto";

/**
 * How an alert to another system is signed, and the rules for where one may
 * be sent. Pure, so the published documentation (/developers) and the tests
 * hold the same contract as the sender.
 *
 * Each alert carries `MCA-Signature: t=<unix seconds>,v1=<hex>`, where hex is
 * the HMAC-SHA256, with the endpoint's secret, of `<t>.<raw body>`. The
 * timestamp is inside what's signed so a receiver can refuse an old alert
 * replayed at it.
 */

export const ALERT_EVENTS = [
  { key: "certificate.issued", label: "Certificate issued", hint: "Someone earns a certificate, online or in a classroom." },
  { key: "training.overdue", label: "Training overdue", hint: "Once a day, the courses that have gone past their due date since the last alert." },
] as const;

export type AlertEvent = (typeof ALERT_EVENTS)[number]["key"] | "ping";

export const SIGNATURE_HEADER = "MCA-Signature";

export function newAlertSecret(): string {
  return "whsec_" + crypto.randomBytes(24).toString("base64url");
}

export function signAlert(secret: string, body: string, at: Date = new Date()): string {
  const t = Math.floor(at.getTime() / 1000);
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** What a receiver does: check the signature, and that it's recent. */
export function verifyAlert(
  secret: string,
  body: string,
  header: string,
  now: Date = new Date(),
  toleranceSeconds = 300,
): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(now.getTime() / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A private, loopback or link-local IPv4/IPv6 address. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/, "");
  const m = v4.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/**
 * Whether an address can take alerts: https, on a public host. Plain http
 * and localhost only outside production, for testing a receiver locally.
 * Returns the reason in a manager's words when it can't.
 */
export function checkAlertUrl(raw: string, production: boolean): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That isn't a web address. It should start with https://" };
  }
  const local = u.hostname === "localhost" || u.hostname.endsWith(".localhost") || isPrivateAddress(u.hostname.replace(/^\[|\]$/g, ""));
  if (production || !local) {
    if (u.protocol !== "https:") return { ok: false, error: "The address must start with https://" };
    if (local) return { ok: false, error: "Alerts can only go to an address on the internet." };
  } else if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "The address must start with https://" };
  }
  if (u.username || u.password) return { ok: false, error: "Leave any password out of the address." };
  return { ok: true, url: u.toString() };
}

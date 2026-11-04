import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/safe-path";
import { requestOrigin } from "@/lib/request-origin";
import { emailLinkType } from "@/lib/email-link";

export const dynamic = "force-dynamic";

/**
 * The "Continue" button on /auth/confirm. This, not opening the emailed link,
 * is what uses the one-time token and signs the person in.
 *
 * Opening the link used to use it. Email security scanners (Microsoft
 * Defender's Safe Links and the like) open every link in an incoming email to
 * check it, so the scanner spent the token seconds after delivery and the
 * person who clicked it was told the link had expired. Scanners fetch pages;
 * they don't press buttons. Found 4 Nov 2026, when a new manager at a
 * Microsoft 365 company couldn't get in from either of two reset emails.
 */
export async function POST(request: NextRequest) {
  const origin = requestOrigin(request);
  const expired = () =>
    NextResponse.redirect(new URL("/login?error=invalid_or_expired_link", origin), 303);

  // A form on this site only: another site must not be able to sign a
  // visitor into an account of its choosing. "null" (a privacy setting) is
  // let through rather than lock that person out.
  const from = request.headers.get("origin");
  if (from && from !== "null" && from !== origin) return expired();

  const form = await request.formData().catch(() => null);
  const tokenHash = form?.get("token_hash");
  const type = emailLinkType(form?.get("type") as string | null);
  const next = form?.get("next");
  if (typeof tokenHash !== "string" || !tokenHash || !type) return expired();

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return expired();

  // Only a path on this site: anything else is an open redirect. 303 so the
  // browser follows with a GET.
  return NextResponse.redirect(
    new URL(safeInternalPath(typeof next === "string" ? next : null, "/dashboard"), origin),
    303,
  );
}

import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Accepts email OTP links (invites, magic links, recovery). Verifies the token,
 * which establishes a session, then forwards to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Back to the address the link was opened on — a company's own, with
  // white label — which is where the session cookie was just set. The
  // request's URL can name the server's own host instead (it does in dev).
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(/:$/, "");
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // Only allow internal redirects.
      const safeNext = next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/dashboard";
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=invalid_or_expired_link", origin),
  );
}

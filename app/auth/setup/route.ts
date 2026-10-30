import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSetPasswordLink } from "@/lib/invites";
import { readSetupToken, setupSecret } from "@/lib/account-setup";

export const dynamic = "force-dynamic";

/**
 * The "Set up your account" button in a training email (lib/account-setup).
 * Makes a fresh set-password link now, for someone who has never signed in,
 * and sends them through it. Anyone who has already signed in goes to the
 * sign-in page instead: the link has done its job, and it must never open an
 * account somebody is using.
 */
export async function GET(request: NextRequest) {
  // Back to the address the link was opened on — a company's own, with
  // white label — as /auth/confirm does.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(/:$/, "");
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;
  const toLogin = (query = "") => NextResponse.redirect(new URL(`/login${query}`, origin));

  const userId = readSetupToken(setupSecret(), request.nextUrl.searchParams.get("t") ?? "");
  if (!userId) return toLogin("?error=invalid_or_expired_link");

  const { data: user } = await createAdminClient()
    .from("users")
    .select("email, status, last_seen_at")
    .eq("id", userId)
    .maybeSingle();
  if (!user?.email || user.status !== "active") return toLogin("?error=invalid_or_expired_link");
  if (user.last_seen_at) return toLogin();

  try {
    const link = new URL(await createSetPasswordLink(user.email as string));
    return NextResponse.redirect(new URL(`${link.pathname}${link.search}`, origin));
  } catch {
    return toLogin("?error=invalid_or_expired_link");
  }
}

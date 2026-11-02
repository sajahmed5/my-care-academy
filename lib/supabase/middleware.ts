import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that require an authenticated user. */
const PROTECTED_PREFIXES = ["/dashboard", "/platform", "/org", "/learn", "/report", "/my-application"];

/**
 * Refreshes the Supabase auth session on every request and enforces coarse
 * auth gating. Fine-grained role checks live in each route (server-side);
 * the database enforces tenant isolation via RLS regardless.
 */
export async function updateSession(request: NextRequest) {
  // The page being rendered, for the console guard (lib/auth.ts
  // requireConsole): a server component or action can't see its own URL.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  let supabaseResponse = NextResponse.next({ request: { headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request: { headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not insert logic between createServerClient and getClaims
  // (avoids random logouts). getClaims() refreshes an expired session and then
  // checks the token's signature locally against the project's public key —
  // getUser() made a round trip to the auth server on every request.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

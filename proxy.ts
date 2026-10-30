import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { companyHostRedirect, isOurHost } from "@/lib/custom-domain";

// Next.js 16 renamed the "middleware" convention to "proxy".
export async function proxy(request: NextRequest) {
  // A company's own web address (white label) opens on sign-in, and sends
  // our public pages to our own address (lib/custom-domain).
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isOurHost(host, process.env.NEXT_PUBLIC_SITE_URL)) {
    const to = companyHostRedirect(
      request.nextUrl.pathname,
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mycareacademy.co.uk",
    );
    if (to) {
      const url = new URL(to, request.url);
      url.search = request.nextUrl.search;
      return NextResponse.redirect(url);
    }
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets so the auth session is
     * refreshed on every navigational request. /h5p and /quiz are public
     * course files: one course page fetches dozens of them, and each used to
     * run this proxy and its auth check for nothing.
     */
    "/((?!_next/static|_next/image|h5p/|quiz/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|json|woff2?|ttf|mp3|mp4|webm|h5p|pdf|txt)$).*)",
  ],
};

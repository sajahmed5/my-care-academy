import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the "middleware" convention to "proxy".
export async function proxy(request: NextRequest) {
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

import type { NextRequest } from "next/server";

/**
 * The address a request was made on — a company's own, with white label — so
 * a redirect lands where the session cookie was set. The request's own URL can
 * name the server's host instead (it does in dev).
 */
export function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(/:$/, "");
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

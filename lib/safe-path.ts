/**
 * A path from a query string that may be followed after sign-in or a
 * confirmed link, or the fallback. Only a path on this site passes: it must
 * start with one "/" and nothing that a browser reads as a new host — "//",
 * or "/\\" (browsers treat a backslash as a slash, so "/\\evil.com" was an
 * open redirect) — and may hold no backslash, control character or
 * whitespace anywhere.
 */
export function safeInternalPath(input: string | null | undefined, fallback: string): string {
  const path = (input ?? "").trim();
  if (!path.startsWith("/")) return fallback;
  if (/^\/[\/\\]/.test(path)) return fallback;
  if (/[\\\s\u0000-\u001f\u007f]/.test(path)) return fallback;
  // Percent-encoded slashes or backslashes decode on the way through a
  // Location header: treat them the same.
  if (/^\/%(2f|5c)/i.test(path)) return fallback;
  return path;
}

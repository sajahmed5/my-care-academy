/**
 * Whether a sign-in token says the account is on a temporary password
 * (lib/temporary-password). Kept apart from that file so the proxy can read it
 * without pulling in the service role.
 */
export function onTemporaryPassword(claims: Record<string, unknown> | null | undefined): boolean {
  const meta = claims?.app_metadata as Record<string, unknown> | undefined;
  return meta?.password_temporary === true;
}

import crypto from "node:crypto";
import { hashKey } from "@/lib/integration-keys";
import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";

/**
 * Server-to-server auth for the /api/portal/* routes.
 *
 * A rostering portal calls with `Authorization: Bearer <key>`; the sha256 of
 * the key is matched against organisations.integration_key_hash, which both
 * authenticates the caller and — more importantly — RESOLVES WHICH ORG it is.
 * Every route then scopes every read and write to that organisation
 * explicitly, because the admin client bypasses RLS and would otherwise see
 * everyone's data.
 *
 * The comparison hashes first and compares hashes timing-safely, so neither
 * string length nor prefix leaks; a wrong key, a revoked key and a missing
 * org answer identically.
 *
 * A valid key is not enough on its own: the organisation's package (or an
 * override) must include platform.portal_api. Before this, the switch on the
 * organisation's settings did nothing and any organisation holding a key
 * could use the API (#77).
 */

export interface PortalOrg {
  id: string;
  name: string;
  /** The integration_keys row the call came in on; null for the old column. */
  keyId: string | null;
}

const unauthorised = () => NextResponse.json({ error: "Unauthorised" }, { status: 401 });

export async function resolvePortalOrg(req: Request): Promise<PortalOrg | NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key) return unauthorised();

  const hash = hashKey(key);
  const admin = createAdminClient();
  // A company's keys live in integration_keys since 31 Oct 2026 (a manager
  // issues them in Settings). The one key before that, on the organisation
  // itself, is still accepted until the column is dropped.
  const { data: keyRow } = await admin
    .from("integration_keys")
    .select("id, organisation_id, key_hash")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  let orgId: string | null = null;
  let keyId: string | null = null;
  let stored: string | null = null;
  if (keyRow) {
    orgId = keyRow.organisation_id as string;
    keyId = keyRow.id as string;
    stored = keyRow.key_hash as string;
  } else {
    const { data: legacy } = await admin
      .from("organisations")
      .select("id, integration_key_hash")
      .eq("integration_key_hash", hash)
      .limit(1)
      .maybeSingle();
    orgId = (legacy?.id as string | undefined) ?? null;
    stored = (legacy?.integration_key_hash as string | null) ?? null;
  }
  if (!orgId || !stored || !crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(hash))) {
    return unauthorised();
  }

  const { data } = await admin.from("organisations").select("id, name, status").eq("id", orgId).maybeSingle();
  if (!data) return unauthorised();
  if (data.status !== "active") {
    return NextResponse.json({ error: "Organisation is not active" }, { status: 403 });
  }
  if (!(await hasFeatureForOrg(admin, data.id, "platform.portal_api"))) {
    return NextResponse.json(
      { error: "Rostering integration is not included in this organisation's package" },
      { status: 403 },
    );
  }
  // When the key was last used, for the connection's status — after the
  // response, so a failed stamp can never fail the call.
  after(async () => {
    const at = new Date().toISOString();
    if (keyId) await admin.from("integration_keys").update({ last_used_at: at }).eq("id", keyId);
    else await admin.from("organisations").update({ integration_key_last_used_at: at }).eq("id", data.id);
  });
  return { id: data.id as string, name: data.name as string, keyId };
}

export const isOrg = (v: PortalOrg | NextResponse): v is PortalOrg => !(v instanceof NextResponse);

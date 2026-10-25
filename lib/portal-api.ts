import crypto from "node:crypto";
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
 * string length nor prefix leaks; a wrong key and a missing org answer
 * identically.
 *
 * A valid key is not enough on its own: the organisation's package (or an
 * override) must include platform.portal_api. Before this, the switch on the
 * organisation's settings did nothing and any organisation holding a key
 * could use the API (#77).
 */

export interface PortalOrg {
  id: string;
  name: string;
}

export async function resolvePortalOrg(req: Request): Promise<PortalOrg | NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const admin = createAdminClient();
  const { data } = await admin
    .from("organisations")
    .select("id, name, status, integration_key_hash")
    .eq("integration_key_hash", hash)
    .limit(1)
    .maybeSingle();

  if (
    !data?.integration_key_hash ||
    !crypto.timingSafeEqual(Buffer.from(data.integration_key_hash), Buffer.from(hash))
  ) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (data.status !== "active") {
    return NextResponse.json({ error: "Organisation is not active" }, { status: 403 });
  }
  if (!(await hasFeatureForOrg(admin, data.id, "platform.portal_api"))) {
    return NextResponse.json(
      { error: "Rostering integration is not included in this organisation's package" },
      { status: 403 },
    );
  }
  // When the key was last used, for the platform's integration panel —
  // after the response, so a failed stamp can never fail the call.
  after(async () => {
    await admin
      .from("organisations")
      .update({ integration_key_last_used_at: new Date().toISOString() })
      .eq("id", data.id);
  });
  return { id: data.id, name: data.name };
}

export const isOrg = (v: PortalOrg | NextResponse): v is PortalOrg => !(v instanceof NextResponse);

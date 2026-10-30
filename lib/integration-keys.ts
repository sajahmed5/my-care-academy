import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A company's keys for the rostering API (/api/portal/*): its MyRoster key,
 * and one for each other system built against the published API
 * (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026). A manager issues them in
 * Settings; a platform admin can still do it on the company's Integration
 * tab. Only the sha256 is kept — a key is shown once, to whoever issued it.
 *
 * organisations.integration_key_hash held the one key before this. It stays
 * as a fallback the API still accepts until it's dropped, so anything that
 * replaces or revokes a MyRoster key clears it too — otherwise the old key
 * would keep working through the fallback.
 */

export type IntegrationSystem = "myroster" | "other";

export interface IntegrationKey {
  id: string;
  system: IntegrationSystem;
  label: string;
  hint: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** A new key and the hash that is stored for it. */
export function newIntegrationKey(): { key: string; hash: string } {
  const key = "mca_" + crypto.randomBytes(32).toString("base64url");
  return { key, hash: hashKey(key) };
}

/** The company's live keys, MyRoster's first. */
export async function liveKeys(organisationId: string): Promise<IntegrationKey[]> {
  const { data } = await createAdminClient()
    .from("integration_keys")
    .select("id, system, label, hint, created_at, last_used_at")
    .eq("organisation_id", organisationId)
    .is("revoked_at", null)
    .order("created_at");
  return (data ?? [])
    .map((k) => ({
      id: k.id as string,
      system: k.system as IntegrationSystem,
      label: k.label as string,
      hint: (k.hint as string | null) ?? null,
      createdAt: k.created_at as string,
      lastUsedAt: (k.last_used_at as string | null) ?? null,
    }))
    .sort((a, b) => (a.system === b.system ? 0 : a.system === "myroster" ? -1 : 1));
}

/**
 * Issue a key. A MyRoster key replaces the company's current one, which stops
 * working at once; another system's key is added beside the rest.
 */
export async function issueKey(opts: {
  organisationId: string;
  system: IntegrationSystem;
  label: string;
  actorId: string | null;
}): Promise<{ key: string; id: string; replaced: boolean }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  let replaced = false;
  if (opts.system === "myroster") {
    const { data: old } = await admin
      .from("integration_keys")
      .update({ revoked_at: now, revoked_by: opts.actorId })
      .eq("organisation_id", opts.organisationId)
      .eq("system", "myroster")
      .is("revoked_at", null)
      .select("id");
    replaced = (old ?? []).length > 0;
    await clearLegacyKey(opts.organisationId);
  }
  const { key, hash } = newIntegrationKey();
  const { data, error } = await admin
    .from("integration_keys")
    .insert({
      organisation_id: opts.organisationId,
      system: opts.system,
      label: opts.label,
      key_hash: hash,
      hint: key.slice(-4),
      created_by: opts.actorId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not issue a key.");
  return { key, id: data.id as string, replaced };
}

/** Switch one of the company's keys off. The system's next call is refused. */
export async function revokeKey(opts: {
  organisationId: string;
  keyId: string;
  actorId: string | null;
}): Promise<IntegrationKey["system"] | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("integration_keys")
    .update({ revoked_at: new Date().toISOString(), revoked_by: opts.actorId })
    .eq("id", opts.keyId)
    .eq("organisation_id", opts.organisationId)
    .is("revoked_at", null)
    .select("system")
    .maybeSingle();
  if (!data) return null;
  if (data.system === "myroster") await clearLegacyKey(opts.organisationId);
  return data.system as IntegrationSystem;
}

async function clearLegacyKey(organisationId: string): Promise<void> {
  await createAdminClient()
    .from("organisations")
    .update({ integration_key_hash: null, integration_key_created_at: null, integration_key_last_used_at: null })
    .eq("id", organisationId);
}

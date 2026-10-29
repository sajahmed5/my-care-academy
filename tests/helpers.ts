import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load .env.local so tests run against the configured project.
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
}

export type UserRole = "platform_admin" | "org_admin" | "org_office" | "learner" | "candidate";

/** Service-role client — bypasses RLS. For seeding/cleanup only. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Create an org via the service role. Returns its id. */
export async function createOrg(name: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("organisations")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Switch one feature on or off for an org, as a platform admin would.
 *
 * An override row beats whatever the org's package includes, so this entitles
 * a test org regardless of its tier — which is also what makes it the right
 * way to set up a gated-feature suite.
 */
export async function setFeature(
  organisationId: string,
  featureKey: string,
  enabled: boolean,
): Promise<void> {
  const admin = adminClient();
  const { error } = await admin
    .from("organisation_features")
    .upsert(
      { organisation_id: organisationId, feature_key: featureKey, enabled },
      { onConflict: "organisation_id,feature_key" },
    );
  if (error) throw error;
}

/** Create an auth user + profile (via the handle_new_user trigger + metadata). */
export async function createUser(opts: {
  email: string;
  password: string;
  role: UserRole;
  organisationId?: string | null;
  fullName?: string;
}): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    user_metadata: {
      role: opts.role,
      organisation_id: opts.organisationId ?? null,
      full_name: opts.fullName ?? opts.email,
    },
  });
  if (error) throw error;
  return data.user.id;
}

/** A fresh anon client signed in as the given user. */
export async function signIn(
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** Decode custom claims from a signed-in client's access token. */
export async function claimsOf(
  client: SupabaseClient,
): Promise<Record<string, unknown>> {
  const {
    data: { session },
  } = await client.auth.getSession();
  const token = session?.access_token;
  if (!token) return {};
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
}

/** Delete auth users and orgs created during a test run. */
export async function cleanup(userIds: string[], orgIds: string[]) {
  const admin = adminClient();
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  if (orgIds.length) {
    await admin.from("organisations").delete().in("id", orgIds);
  }
}

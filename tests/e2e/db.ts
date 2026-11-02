import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A service-role client for the LOCAL stack, for looking up seeded ids and
 * checking what a flow wrote. Never used for anything the app itself does.
 */
let client: SupabaseClient | null = null;
export function adminDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^(http:\/\/(127\.0\.0\.1|localhost)|.*\.localhost)/.test(url)) {
    throw new Error(`tests/e2e only run against a local Supabase stack, not ${url}`);
  }
  client ??= createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
  return client;
}

/** One row, or throw with the table name. */
export async function row<T = Record<string, unknown>>(table: string, match: Record<string, unknown>, select = "*"): Promise<T> {
  let q = adminDb().from(table).select(select);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  if (!data) throw new Error(`${table}: no row matching ${JSON.stringify(match)}`);
  return data as T;
}

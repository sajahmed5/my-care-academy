import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitiseHiddenAreas } from "@/lib/office-access";

const NONE: ReadonlySet<string> = new Set();

/**
 * The areas this person can't open: empty for a manager (and anyone who is
 * not an office worker), the company's switches for an office worker. Read
 * once per request (React cache) under RLS, so it costs one small read on
 * the pages that ask.
 */
export const hiddenAreasFor = cache(async (context: UserContext): Promise<ReadonlySet<string>> => {
  if (context.role !== "org_office" || !context.organisationId) return NONE;
  const supabase = await createClient();
  return hiddenAreasWith(supabase, context.organisationId);
});

/** The same, with a client handed in: for jobs and code without request cookies. */
export async function hiddenAreasWith(client: SupabaseClient, organisationId: string): Promise<ReadonlySet<string>> {
  const { data } = await client.from("organisations").select("office_hidden_areas").eq("id", organisationId).maybeSingle();
  return new Set(sanitiseHiddenAreas(data?.office_hidden_areas));
}

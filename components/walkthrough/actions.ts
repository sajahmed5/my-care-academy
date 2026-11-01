"use server";

import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The walkthrough's per-person flags live in users.walkthrough (jsonb). A
 * person may not update their own users row under RLS, so these write with
 * the service role, to the signed-in person's row and nothing else. The
 * two keys are merged in, so neither write loses the other.
 */
async function setFlag(key: "tour_seen_at" | "list_hidden_at", value: string | null): Promise<void> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const { data } = await admin.from("users").select("walkthrough").eq("id", context.userId).maybeSingle();
  const current = (data?.walkthrough as Record<string, unknown> | null) ?? {};
  const next = { ...current, [key]: value };
  if (value === null) delete next[key];
  await admin.from("users").update({ walkthrough: next }).eq("id", context.userId);
  revalidatePath("/org");
}

/** The welcome or the tour was seen (taken or skipped): it does not open by itself again. */
export async function markTourSeen(): Promise<void> {
  await setFlag("tour_seen_at", new Date().toISOString());
}

/** "Hide for now" on the Getting started list, and Help's way of bringing it back. */
export async function setGettingStartedHidden(hidden: boolean): Promise<void> {
  await setFlag("list_hidden_at", hidden ? new Date().toISOString() : null);
}

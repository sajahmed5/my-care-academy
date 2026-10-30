"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/candidate-links";
import { saveExitAnswers } from "@/lib/hr/leavers-server";

/**
 * The exit interview from the emailed link (HR-PACK.md): for someone whose
 * login may already be off. The link opens this one record, and runs as the
 * service role only after the check.
 */

const BAD = "This link has expired or isn't valid any more.";

async function forToken(raw: string) {
  if (!raw || raw.length < 20 || raw.length > 64) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("hr_leavers")
    .select("id, exit_status, exit_token_expires_at, organisations(name), users!hr_leavers_user_id_fkey(full_name)")
    .eq("exit_token_hash", hashToken(raw))
    .maybeSingle();
  if (!data || !data.exit_token_expires_at || Date.parse(data.exit_token_expires_at as string) < Date.now()) return null;
  return { admin, l: data };
}

export async function loadExitAction(raw: string): Promise<{ ok: boolean; error?: string; company?: string; name?: string }> {
  const found = await forToken(raw);
  if (!found || found.l.exit_status !== "asked") return { ok: false, error: BAD };
  const org = found.l.organisations as unknown as { name: string } | null;
  const u = found.l.users as unknown as { full_name: string | null } | null;
  return { ok: true, company: org?.name ?? "", name: (u?.full_name ?? "").split(/\s+/)[0] || "there" };
}

export async function submitExitAction(raw: string, answers: unknown): Promise<{ ok: boolean; error?: string }> {
  const h = await headers();
  if (!rateLimit(`exit:${(h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()}`, 20, 60 * 60_000)) return { ok: false, error: "Too many tries. Please wait a while." };
  const found = await forToken(raw);
  if (!found || found.l.exit_status !== "asked") return { ok: false, error: BAD };
  return saveExitAnswers(found.admin, found.l.id as string, answers);
}

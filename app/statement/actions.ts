"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/candidate-links";
import { validSignature } from "@/lib/signing-documents";

/**
 * A witness writing their own statement from the emailed link (HR-PACK.md).
 * No account: the link opens this one statement, and runs as the service role
 * only after the check. They see who asked and nothing else of the case.
 */

const BAD = "This link has expired or isn't valid any more. Ask whoever sent it for a new one.";

async function forToken(raw: string) {
  if (!raw || raw.length < 20 || raw.length > 64) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("hr_case_statements")
    .select("id, case_id, witness_name, status, token_expires_at, organisations(name)")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!data || !data.token_expires_at || Date.parse(data.token_expires_at as string) < Date.now()) return null;
  return { admin, s: data };
}

export async function loadStatementAction(raw: string): Promise<{ ok: boolean; error?: string; company?: string; name?: string; done?: boolean }> {
  const found = await forToken(raw);
  if (!found) return { ok: false, error: BAD };
  const org = found.s.organisations as unknown as { name: string } | null;
  return { ok: true, company: org?.name ?? "", name: found.s.witness_name as string, done: found.s.status === "signed" };
}

export async function submitStatementAction(raw: string, input: { statement: string; signature: string; signedName: string }): Promise<{ ok: boolean; error?: string }> {
  const h = await headers();
  if (!rateLimit(`statement:${(h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()}`, 20, 60 * 60_000)) {
    return { ok: false, error: "Too many tries. Please wait a while and try again." };
  }
  const found = await forToken(raw);
  if (!found) return { ok: false, error: BAD };
  if (found.s.status === "signed") return { ok: false, error: "Your statement has already been sent. Thank you." };
  const statement = input.statement.replace(/\r/g, "").trim().slice(0, 20000);
  if (statement.length < 20) return { ok: false, error: "Please write your account in full." };
  const signedName = input.signedName.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!validSignature(input.signature) || !signedName) return { ok: false, error: "Please sign and type your name." };
  const { error } = await found.admin
    .from("hr_case_statements")
    .update({ statement, signature: input.signature, signed_name: signedName, signed_at: new Date().toISOString(), status: "signed", token_expires_at: new Date().toISOString() })
    .eq("id", found.s.id as string)
    .eq("status", "sent");
  if (error) return { ok: false, error: "It didn't send. Please try again." };
  await found.admin.from("hr_case_notes").insert({
    organisation_id: (await found.admin.from("hr_cases").select("organisation_id").eq("id", found.s.case_id as string).single()).data?.organisation_id,
    case_id: found.s.case_id,
    kind: "event",
    body: `Witness statement written and signed by ${found.s.witness_name as string}.`,
  });
  return { ok: true };
}

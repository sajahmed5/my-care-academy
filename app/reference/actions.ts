"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/candidate-links";
import { formatDate } from "@/lib/dates";
import type { Answers, FieldError } from "@/lib/recruitment-application";
import { kindForType, referenceFlags, sanitiseReference, validateReference, type ReferenceKind } from "@/lib/recruitment-references";

/**
 * The referee's side (RECRUITMENT.md, release 4). No account: the emailed
 * link is the key, opens this one reference, and runs as the service role
 * only after the check. Brought across from MyRoster's /api/recruit/reference.
 */

const BAD = "This reference link has expired or isn't valid any more. The company can send you a new one.";

async function forToken(raw: string) {
  if (!raw || raw.length < 20 || raw.length > 64) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("candidate_references")
    .select("id, organisation_id, candidate_id, position, referee_type, referee_name, candidate_job_title, employed_from, employed_to, status, token_expires_at, opened_at, candidates(full_name, status), organisations(name)")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!data || !data.token_expires_at || Date.parse(data.token_expires_at as string) < Date.now()) return null;
  return { admin, r: data };
}

export interface LoadedReference {
  company: string;
  candidate: string;
  dob: string | null;
  kind: ReferenceKind;
  received: boolean;
  prefill: Answers;
}

export async function loadReferenceAction(token: string): Promise<LoadedReference | { error: string }> {
  const found = await forToken(token);
  if (!found) return { error: BAD };
  const { admin, r } = found;
  if (!r.opened_at) await admin.from("candidate_references").update({ opened_at: new Date().toISOString() }).eq("id", r.id as string);
  const { data: app } = await admin.from("candidate_applications").select("answers").eq("candidate_id", r.candidate_id as string).maybeSingle();
  const dob = (app?.answers as Record<string, unknown> | null)?.dob;
  return {
    company: (r.organisations as unknown as { name: string } | null)?.name ?? "",
    candidate: (r.candidates as unknown as { full_name: string } | null)?.full_name ?? "",
    dob: typeof dob === "string" ? formatDate(dob) : null,
    kind: kindForType(r.referee_type as string),
    received: r.status === "received",
    prefill: {
      ...(r.candidate_job_title ? { jobTitle: r.candidate_job_title as string } : {}),
      ...(r.employed_from ? { employedFrom: r.employed_from as string } : {}),
      ...(r.employed_to ? { employedTo: r.employed_to as string } : {}),
      refereeName: (r.referee_name as string) ?? "",
    },
  };
}

/**
 * The reference, sent: checked again here, then put in front of the office
 * on the matching Reference step as waiting on them, with anything worth a
 * second look (would not recommend, a safeguarding concern…) on the step.
 */
export async function submitReferenceAction(
  token: string,
  raw: unknown,
): Promise<{ ok: boolean; error?: string; problems?: Record<string, FieldError[]> }> {
  const h = await headers();
  if (!rateLimit(`reference:${(h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()}`, 20, 60 * 60_000)) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }
  const found = await forToken(token);
  if (!found) return { ok: false, error: BAD };
  const { admin, r } = found;
  if (r.status === "received") return { ok: true };
  const kind = kindForType(r.referee_type as string);
  const answers = sanitiseReference(kind, raw);
  const problems = validateReference(kind, answers, new Date().toISOString().slice(0, 10));
  if (Object.keys(problems).length) return { ok: false, error: "Some answers still need filling in.", problems };

  const now = new Date().toISOString();
  await admin.from("candidate_references").update({ answers, status: "received", received_at: now }).eq("id", r.id as string);
  const flags = referenceFlags(kind, answers);
  await admin.from("candidate_documents").upsert(
    {
      candidate_id: r.candidate_id,
      organisation_id: r.organisation_id,
      doc_type: `reference_${r.position}`,
      file_path: null,
      not_required: false,
      review_status: "submitted",
      review_note: `From ${r.referee_name}${flags.length ? `. Look first: ${flags.join("; ")}` : ""}`,
      uploaded_by_candidate: true,
      reviewed_by: null,
      reviewed_at: null,
    },
    { onConflict: "candidate_id,doc_type" },
  );
  return { ok: true };
}

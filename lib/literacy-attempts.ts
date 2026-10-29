import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, newToken } from "@/lib/candidate-links";
import { siteOrigin } from "@/lib/site-url";
import { markLiteracy, sanitiseLiteracyAnswers, sanitiseLiteracySettings, testFor, testOf, type LiteracyResult } from "@/lib/literacy-test";

/**
 * Literacy attempts (RECRUITMENT.md, release 3), brought across from
 * MyRoster's literacyAttempts.ts: unlocking one, and closing and marking it.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** A QR code in the office has 15 minutes to be scanned; an emailed link, three days. */
const OFFICE_MS = 15 * 60_000;
const REMOTE_MS = 3 * 86_400_000;

export const ATTEMPT_COLUMNS =
  "id, organisation_id, candidate_id, attempt_no, mode, status, token_expires_at, unlocked_at, started_at, deadline_at, submitted_at, ended_by, answers, score, max_score, percent, passed, left_page_count, test";

export async function latestAttempt(admin: Admin, candidateId: string) {
  const { data } = await admin
    .from("literacy_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("candidate_id", candidateId)
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Open the test for a candidate: the attempt waiting to be started if there
 * is one (with a fresh link), a retake after a finished one only when asked.
 * Returns the link to show as a QR code or to email.
 */
export async function unlockAttempt(
  admin: Admin,
  opts: { candidateId: string; orgId: string; mode: "office" | "remote"; by: string; retake: boolean },
): Promise<{ link: string; expiresAt: string } | { error: string }> {
  const latest = await latestAttempt(admin, opts.candidateId);
  if (latest?.status === "in_progress") return { error: "They're taking the test right now." };
  if (latest?.status === "submitted" && !opts.retake) return { error: "They've already taken it. Allow a retake to unlock it again." };
  const raw = newToken();
  const expiresAt = new Date(Date.now() + (opts.mode === "office" ? OFFICE_MS : REMOTE_MS)).toISOString();
  // The company's test as it stands now goes onto the attempt: a later edit never changes how it's marked.
  const { data: settings } = await admin.from("recruitment_settings").select("literacy_settings").eq("organisation_id", opts.orgId).maybeSingle();
  const test = testFor(sanitiseLiteracySettings(settings?.literacy_settings));
  const row = { mode: opts.mode, token_hash: hashToken(raw), token_expires_at: expiresAt, unlocked_by: opts.by, unlocked_at: new Date().toISOString(), test };
  if (latest?.status === "unlocked") {
    await admin.from("literacy_attempts").update(row).eq("id", latest.id as string);
  } else {
    const { error } = await admin
      .from("literacy_attempts")
      .insert({ ...row, organisation_id: opts.orgId, candidate_id: opts.candidateId, attempt_no: ((latest?.attempt_no as number | undefined) ?? 0) + 1 });
    if (error) return { error: "The test couldn't be unlocked. Try again." };
  }
  return { link: `${await siteOrigin()}/apply/test?t=${raw}`, expiresAt };
}

/** The attempt a test link opens, if it's real. */
export async function attemptForToken(admin: Admin, raw: string) {
  if (!raw || raw.length < 20 || raw.length > 64) return null;
  const { data } = await admin
    .from("literacy_attempts")
    .select(`${ATTEMPT_COLUMNS}, candidates(full_name, status), organisations(name)`)
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  return data;
}

/**
 * Close a running attempt and mark it on the answers SAVED on the server —
 * never on anything sent once time is up. Safe to call twice: only the call
 * that flips in_progress to submitted files the result, which puts the
 * Literacy step in front of the office with the score. Pass or fail, a
 * person decides what happens next.
 */
export async function finaliseAttempt(
  admin: Admin,
  attempt: { id: string; organisation_id: string; candidate_id: string; answers: unknown; mode: string; attempt_no: number; test: unknown },
  endedBy: "candidate" | "time",
): Promise<LiteracyResult> {
  const test = testOf(attempt.test);
  const result = markLiteracy(sanitiseLiteracyAnswers(attempt.answers, test), test);
  const now = new Date().toISOString();
  const { data: closed } = await admin
    .from("literacy_attempts")
    .update({ status: "submitted", submitted_at: now, ended_by: endedBy, score: result.score, max_score: result.max, percent: result.percent, passed: result.passed })
    .eq("id", attempt.id)
    .eq("status", "in_progress")
    .select("id");
  if (!closed?.length) return result;

  const where = attempt.mode === "remote" ? "taken at home" : "taken in the office";
  const note = `${result.score}/${result.max} (${result.percent}%), ${result.passed ? "passed" : "below the pass mark"} · ${where}${
    endedBy === "time" ? " · ran out of time" : ""
  }${attempt.attempt_no > 1 ? ` · attempt ${attempt.attempt_no}` : ""}`;
  await admin.from("candidate_documents").upsert(
    {
      candidate_id: attempt.candidate_id,
      organisation_id: attempt.organisation_id,
      doc_type: "literacy",
      file_path: null,
      file_name: null,
      not_required: false,
      review_status: "submitted",
      review_note: note,
      uploaded_by_candidate: true,
      reviewed_by: null,
      reviewed_at: null,
    },
    { onConflict: "candidate_id,doc_type" },
  );
  return result;
}

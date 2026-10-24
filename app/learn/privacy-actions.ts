"use server";

import { getUserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { anonymiseUserRecords, purgeUserFiles } from "@/lib/user-erasure";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/dates";

/** One row of a learner's training record — one completed (certificated) course. */
export interface TrainingRecordRow {
  course: string;
  completed: string; // DD/MM/YYYY
  expiry: string; // DD/MM/YYYY or "No expiry"
  certificateNumber: string;
  score: string; // e.g. "95%" (best passing assessment), or ""
}

function ddmmyyyy(iso: string | null): string {
  if (!iso) return "";
  return formatDate(iso, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * UK-GDPR: a learner exports their own training record as a spreadsheet
 * (CSV, opens in Excel). One row per completed course: title, completion date,
 * expiry, certificate number, and best passing assessment score.
 */
export async function exportMyDataAction(): Promise<{
  rows?: TrainingRecordRow[];
  error?: string;
}> {
  const context = await getUserContext();
  if (!context) return { error: "Not signed in." };

  const admin = createAdminClient();
  const [{ data: certificates }, { data: attempts }] = await Promise.all([
    admin
      .from("certificates")
      .select("certificate_number, issued_at, expires_at, course_id, courses(title)")
      .eq("user_id", context.userId)
      .order("issued_at", { ascending: true }),
    admin
      .from("quiz_attempts")
      .select("course_id, score, passed")
      .eq("user_id", context.userId),
  ]);

  // Best passing assessment score per course (fall back to best score of any
  // attempt for that course if none are flagged passed).
  const bestPassed = new Map<string, number>();
  const bestAny = new Map<string, number>();
  for (const a of attempts ?? []) {
    if (a.score == null) continue;
    if (a.score > (bestAny.get(a.course_id) ?? -1)) bestAny.set(a.course_id, a.score);
    if (a.passed && a.score > (bestPassed.get(a.course_id) ?? -1)) {
      bestPassed.set(a.course_id, a.score);
    }
  }

  const rows: TrainingRecordRow[] = (certificates ?? []).map((c) => {
    const title =
      (c.courses as unknown as { title: string } | null)?.title ?? "";
    const score = bestPassed.get(c.course_id) ?? bestAny.get(c.course_id);
    return {
      course: title,
      completed: ddmmyyyy(c.issued_at),
      expiry: c.expires_at ? ddmmyyyy(c.expires_at) : "No expiry",
      certificateNumber: c.certificate_number,
      score: score != null ? `${score}%` : "",
    };
  });

  return { rows };
}

/** UK-GDPR: a learner permanently deletes their own account (cascades). */
export async function deleteMyAccountAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const context = await getUserContext();
  if (!context) return { ok: false, error: "Not signed in." };
  if (context.role !== "learner") {
    return {
      ok: false,
      error: "Admins must be removed by another administrator.",
    };
  }

  const admin = createAdminClient();
  // Their certificates and any care-certificate evidence live in storage, and
  // the rows naming those files cascade away with the account. This is the
  // erasure route, so the files have to go with it.
  const purge = await purgeUserFiles(admin, context.userId);
  const anon = await anonymiseUserRecords(admin, context.userId, context.email ?? null);

  await logAudit({
    context,
    action: "account.self_deleted",
    entity: "user",
    entityId: context.userId,
    detail: {
      filesFound: purge.found,
      filesRemoved: purge.removed,
      fileFailures: purge.failures,
      anonymised: anon,
    },
  });

  const { error } = await admin.auth.admin.deleteUser(context.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

import type { SupabaseClient } from "@supabase/supabase-js";

/** A bucket and the object paths belonging to one user inside it. */
export interface BucketFiles {
  bucket: string;
  paths: string[];
}

export interface PurgeResult {
  /** Everything found, whether or not removal succeeded — the audit trail. */
  found: BucketFiles[];
  removed: number;
  failures: { bucket: string; error: string }[];
}

/**
 * Where a user's stored files live, and the row that points at each. Every one
 * of these tables cascades on users.id, so the row is gone the instant the
 * account is deleted — taking the only record of the file path with it. The
 * file itself stays in the bucket forever, unreachable and unattributable.
 *
 * Buckets deliberately absent: form-uploads and issue-screenshots hang off rows
 * whose user reference is SET NULL, so those rows (and the path) survive the
 * deletion and the file is still accounted for. candidate-docs belongs to
 * recruitment candidates, who are not users.
 */
const SOURCES: { table: string; column: string; bucket: string }[] = [
  { table: "certificates", column: "pdf_path", bucket: "certificates" },
  // A current staff member's right to work, DBS, references and insurance.
  { table: "staff_documents", column: "file_path", bucket: "staff-docs" },
  // HR letters sent to them, kept as PDFs (HR-PACK.md).
  { table: "hr_letters", column: "pdf_path", bucket: "hr-docs" },
  { table: "sickness_absences", column: "fit_note_path", bucket: "hr-docs" },
  {
    table: "care_cert_observations",
    column: "evidence_path",
    bucket: "observation-evidence",
  },
  {
    table: "care_cert_signoffs",
    column: "pdf_path",
    bucket: "observation-evidence",
  },
];

/** Collapse the per-table findings into one list of paths per bucket. */
export function groupByBucket(
  entries: { bucket: string; path: string }[],
): BucketFiles[] {
  const byBucket = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.path) continue;
    const set = byBucket.get(e.bucket) ?? new Set<string>();
    set.add(e.path);
    byBucket.set(e.bucket, set);
  }
  return [...byBucket.entries()].map(([bucket, paths]) => ({
    bucket,
    paths: [...paths],
  }));
}

/**
 * Delete a user's stored files. MUST run before the auth user is deleted:
 * afterwards the rows naming these paths no longer exist.
 *
 * Never throws and never blocks the deletion — an erasure request shouldn't
 * fail because storage is having a bad day. Anything it couldn't remove comes
 * back in `failures`, and callers record `found` in the audit log so a human
 * can finish the job by hand.
 */
export async function purgeUserFiles(
  admin: SupabaseClient,
  userId: string,
): Promise<PurgeResult> {
  const entries: { bucket: string; path: string }[] = [];
  for (const src of SOURCES) {
    const { data } = await admin
      .from(src.table)
      .select(src.column)
      .eq("user_id", userId);
    for (const row of data ?? []) {
      const path = (row as unknown as Record<string, unknown>)[src.column];
      if (typeof path === "string" && path) {
        entries.push({ bucket: src.bucket, path });
      }
    }
  }

  const found = groupByBucket(entries);
  let removed = 0;
  const failures: { bucket: string; error: string }[] = [];

  for (const { bucket, paths } of found) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) failures.push({ bucket, error: error.message });
    else removed += paths.length;
  }

  return { found, removed, failures };
}

/**
 * What replaces a deleted person's address. A single shared marker, not a
 * per-user token: anything stable enough to group one person's rows back
 * together is another identifier, which is the thing being removed.
 */
export const REDACTED_EMAIL = "[deleted user]";

export interface AnonymiseResult {
  emailLog: number;
  issueReports: number;
}

/**
 * Strip a deleted user's address from the rows that keep their own copy of it.
 *
 * Neither table is reachable by the cascade: email_log has no user_id at all —
 * the address IS its only identifier — and issue_reports nulls its user_id
 * while keeping reporter_email. So "delete this person" left their email
 * behind in both, indefinitely and undeclared.
 *
 * The rows survive on purpose. How many reminders went out, when, whether they
 * were delivered, and what an issue said are all worth keeping: a care
 * provider may need to show it chased someone about mandatory training. Only
 * the identifier goes.
 *
 * audit_logs is deliberately untouched — it is the record OF the erasure, and
 * an accountability trail that erases itself is not one.
 *
 * MUST run before the auth user is deleted, while user_id still resolves.
 */
export async function anonymiseUserRecords(
  admin: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<AnonymiseResult> {
  let emailLog = 0;
  let issueReports = 0;

  if (email) {
    const { data } = await admin
      .from("email_log")
      .update({ to_email: REDACTED_EMAIL })
      .eq("to_email", email)
      .select("id");
    emailLog = data?.length ?? 0;
  }

  // By user_id while it still resolves, and by address for anything filed
  // before the account existed or already detached.
  const { data: byUser } = await admin
    .from("issue_reports")
    .update({ reporter_email: null })
    .eq("user_id", userId)
    .select("id");
  issueReports += byUser?.length ?? 0;

  if (email) {
    const { data: byEmail } = await admin
      .from("issue_reports")
      .update({ reporter_email: null })
      .eq("reporter_email", email)
      .select("id");
    issueReports += byEmail?.length ?? 0;
  }

  return { emailLog, issueReports };
}

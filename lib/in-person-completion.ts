import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { issueCertificate } from "@/lib/issue-certificate";

/**
 * Complete a library course for people who did it in a room — the company's
 * own classroom session, or one of ours face to face — and issue each a
 * certificate, dated the day it was held. The enrolment is completed (or made,
 * already complete) so the matrix, renewal reminders and the evidence pack
 * treat it like any other completion.
 *
 * Runs as the service role: the caller has already established that each
 * person attended. Returns each person's new certificate id; anyone missing
 * from the map didn't get one.
 */
export async function completeInPerson({
  admin,
  organisationId,
  userIds,
  courseId,
  heldOn,
  note,
}: {
  admin: SupabaseClient;
  organisationId: string;
  userIds: string[];
  courseId: string;
  /** The UK day it was held, "2026-11-05". */
  heldOn: string;
  /** The certificate's footer line: where and with whom. */
  note: string;
}): Promise<Map<string, string>> {
  const issued = new Map<string, string>();
  if (userIds.length === 0) return issued;
  const issuedAt = new Date(`${heldOn}T12:00:00Z`);
  const { data: existing } = await admin
    .from("enrolments")
    .select("id, user_id, completion_count")
    .eq("course_id", courseId)
    .in("user_id", userIds);
  const byUser = new Map((existing ?? []).map((e) => [e.user_id as string, e]));
  for (const userId of userIds) {
    const prior = byUser.get(userId);
    if (prior) {
      await admin
        .from("enrolments")
        .update({ status: "completed", progress: 100, completion_count: ((prior.completion_count as number) ?? 0) + 1 })
        .eq("id", prior.id);
    } else {
      await admin.from("enrolments").insert({
        organisation_id: organisationId,
        user_id: userId,
        course_id: courseId,
        status: "completed",
        progress: 100,
        completion_count: 1,
        due_date: heldOn,
      });
    }
    const certificateId = await issueCertificate({ admin, userId, organisationId, courseId, issuedAt, note });
    if (certificateId) issued.set(userId, certificateId);
  }
  return issued;
}

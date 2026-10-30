"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SaveProgressInput {
  enrolmentId: string;
  currentBlock: number;
  progress: number;
  timeSpentDelta: number;
}

/**
 * Persist a learner's position, progress and time spent for one course.
 * RLS guarantees a learner can only update their own enrolment.
 */
export async function saveProgressAction(
  input: SaveProgressInput,
): Promise<{ ok: boolean }> {
  await requireStaff();
  const supabase = await createClient();

  const { data: enrolment } = await supabase
    .from("enrolments")
    .select("time_spent, progress, status")
    .eq("id", input.enrolmentId)
    .single();
  if (!enrolment) return { ok: false };

  const newProgress = Math.min(
    100,
    Math.max(enrolment.progress ?? 0, input.progress),
  );
  const status =
    enrolment.status === "completed"
      ? "completed"
      : newProgress > 0
        ? "in_progress"
        : enrolment.status;

  const { error } = await supabase
    .from("enrolments")
    .update({
      current_block: Math.max(0, input.currentBlock),
      progress: newProgress,
      time_spent: (enrolment.time_spent ?? 0) + Math.max(0, input.timeSpentDelta),
      status,
    })
    .eq("id", input.enrolmentId);

  return { ok: !error };
}

/**
 * A learner self-enrols on a catalogue course. Inserts a clean not_started
 * enrolment via the service role — deliberately NOT a learner-insert RLS policy,
 * so a learner cannot fabricate a completed/passed status.
 */
export async function selfEnrolAction(
  courseId: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireStaff();
  if (!context.organisationId) {
    return { ok: false, error: "Your account has no organisation." };
  }

  const admin = createAdminClient();

  const [{ data: course }, { data: existing }] = await Promise.all([
    admin.from("courses").select("id").eq("id", courseId).is("retired_at", null).maybeSingle(),
    admin
      .from("enrolments")
      .select("id")
      .eq("user_id", context.userId)
      .eq("course_id", courseId)
      .maybeSingle(),
  ]);
  if (!course) return { ok: false, error: "Course not found." };
  if (existing) return { ok: false, error: "You're already enrolled." };

  const { error } = await admin.from("enrolments").insert({
    organisation_id: context.organisationId,
    user_id: context.userId,
    course_id: courseId,
    status: "not_started",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/learn/modules/all");
  revalidatePath("/learn/modules");
  revalidatePath("/learn");
  return { ok: true };
}

/** Mark the learner's notifications as read (updates notifications_read_at). */
export async function markNotificationsReadAction(): Promise<{ ok: boolean }> {
  const context = await requireStaff();
  const admin = createAdminClient();
  await admin
    .from("users")
    .update({ notifications_read_at: new Date().toISOString() })
    .eq("id", context.userId);
  revalidatePath("/learn/notifications");
  revalidatePath("/learn");
  return { ok: true };
}

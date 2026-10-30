"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/fetch-all";
import { logAudit } from "@/lib/audit";

export interface QuestionInput {
  question: string;
  options: string[];
  answerIndex: number;
}

function validate(input: QuestionInput): string | null {
  if (!input.question.trim()) return "Question text is required.";
  const opts = input.options.map((o) => o.trim());
  if (opts.length < 2 || opts.some((o) => !o))
    return "Provide at least two non-empty options.";
  if (input.answerIndex < 0 || input.answerIndex >= opts.length)
    return "Choose which option is correct.";
  return null;
}

/** Add a question to a course's bank (platform_admin, enforced by RLS). */
export async function addQuestionAction(
  courseId: string,
  input: QuestionInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requireRole("platform_admin");
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_questions")
    .insert({
      course_id: courseId,
      question: input.question.trim(),
      options: input.options.map((o) => o.trim()),
      answer_index: input.answerIndex,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/platform/courses/${courseId}`);
  return { ok: true, id: data.id };
}

export async function updateQuestionAction(
  id: string,
  courseId: string,
  input: QuestionInput,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole("platform_admin");
  const err = validate(input);
  if (err) return { ok: false, error: err };

  // MCQ only: the other types keep their answer in `payload`, and writing
  // options/answer_index over them would corrupt the question.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_questions")
    .update({
      question: input.question.trim(),
      options: input.options.map((o) => o.trim()),
      answer_index: input.answerIndex,
    })
    .eq("id", id)
    .eq("type", "mcq")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length)
    return { ok: false, error: "Only multiple-choice questions can be edited here." };

  revalidatePath(`/platform/courses/${courseId}`);
  return { ok: true };
}

export async function deleteQuestionAction(
  id: string,
  courseId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole("platform_admin");
  const supabase = await createClient();
  const { error } = await supabase.from("quiz_questions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/platform/courses/${courseId}`);
  return { ok: true };
}

/**
 * The assignments retiring a course removes: every company's that nobody has
 * finished — not started, in progress, or required again after its
 * certificate ran out. Completed ones stay, with every certificate.
 */
const UNFINISHED = ["not_started", "in_progress", "expired"];

/** How many unfinished assignments retiring this course would remove, and at how many companies. */
export async function unfinishedAssignments(courseId: string): Promise<{ assignments: number; companies: number }> {
  await requireRole("platform_admin");
  const rows = await fetchAll<{ organisation_id: string }>((f, t) =>
    createAdminClient().from("enrolments").select("organisation_id")
      .eq("course_id", courseId).in("status", UNFINISHED).order("id").range(f, t),
  );
  return { assignments: rows.length, companies: new Set(rows.map((r) => r.organisation_id)).size };
}

/**
 * Retire a course (Saj, 30 Oct 2026): it's offered nowhere from now on, its
 * renewal emails stop, and every unfinished assignment of it is removed.
 * Certificates and completions are kept. Never delete a course instead —
 * that cascades away every company's certificates for it.
 */
export async function retireCourseAction(courseId: string): Promise<{ ok: boolean; removed?: number; error?: string }> {
  const context = await requireRole("platform_admin");
  const admin = createAdminClient();
  const { data: course, error } = await admin
    .from("courses")
    .update({ retired_at: new Date().toISOString(), retired_by: context.userId })
    .eq("id", courseId)
    .is("retired_at", null)
    .select("id, title")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!course) return { ok: false, error: "That course is already retired." };

  // Counted by a paged read first: what a delete hands back is capped at
  // 1,000 rows like any other read.
  const removed = await fetchAll<{ organisation_id: string }>((f, t) =>
    admin.from("enrolments").select("organisation_id")
      .eq("course_id", courseId).in("status", UNFINISHED).order("id").range(f, t),
  );
  const { error: delError } = await admin
    .from("enrolments")
    .delete()
    .eq("course_id", courseId)
    .in("status", UNFINISHED);
  if (delError) return { ok: false, error: `Retired, but the unfinished assignments couldn't be removed: ${delError.message}` };

  const perCompany = new Map<string, number>();
  for (const r of removed) perCompany.set(r.organisation_id, (perCompany.get(r.organisation_id) ?? 0) + 1);
  await logAudit({ context, action: "course.retired", entity: "course", entityId: courseId, detail: { title: course.title, removed: removed.length } });
  // Each company's own log says what went from its carers' lists.
  await Promise.all(
    [...perCompany].map(([organisationId, n]) =>
      logAudit({ context, organisationId, action: "course.retired", entity: "course", entityId: courseId, detail: { title: course.title, removedAssignments: n } }),
    ),
  );

  revalidatePath("/platform/courses");
  revalidatePath(`/platform/courses/${courseId}`);
  revalidatePath("/learn", "layout");
  revalidatePath("/org", "layout");
  return { ok: true, removed: removed.length };
}

/** Bring a retired course back. The assignments removed when it was retired are not restored. */
export async function restoreCourseAction(courseId: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("platform_admin");
  const { data, error } = await createAdminClient()
    .from("courses")
    .update({ retired_at: null, retired_by: null })
    .eq("id", courseId)
    .not("retired_at", "is", null)
    .select("title")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That course isn't retired." };
  await logAudit({ context, action: "course.restored", entity: "course", entityId: courseId, detail: { title: data.title } });
  revalidatePath("/platform/courses");
  revalidatePath(`/platform/courses/${courseId}`);
  revalidatePath("/learn", "layout");
  revalidatePath("/org", "layout");
  return { ok: true };
}

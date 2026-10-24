"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

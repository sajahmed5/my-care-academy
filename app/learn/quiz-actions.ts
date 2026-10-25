"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueCertificate } from "@/lib/issue-certificate";
import {
  QUIZ_TARGET,
  PASS_PERCENT,
  gradeAnswer,
  toPublicQuestion,
  learnerAnswerText,
  correctAnswerText,
  type PublicQuestion,
  type StoredQuestion,
  type ReviewItem,
} from "@/lib/quiz";
import { STARS_PER_COURSE, currentCycleStartMs, bestStarsSince } from "@/lib/stars";

export interface StartQuizResult {
  ok: boolean;
  error?: string;
  attemptId?: string;
  questions?: PublicQuestion[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Begin an attempt: pick random questions, record started_at, return questions (no answers). */
export async function startQuizAction(
  courseId: string,
): Promise<StartQuizResult> {
  const context = await requireRole("learner");

  // Confirm the learner is actually enrolled (RLS scopes to their own row;
  // the user_id filter lets it use the index). The bank's ids are read in the
  // same breath — just the ids, so a 60-question bank isn't pulled whole.
  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: enrolment }, { data: bank }] = await Promise.all([
    supabase
      .from("enrolments")
      .select("id, organisation_id")
      .eq("user_id", context.userId)
      .eq("course_id", courseId)
      .maybeSingle(),
    admin.from("quiz_questions").select("id").eq("course_id", courseId),
  ]);
  if (!enrolment) return { ok: false, error: "You are not enrolled on this course." };

  if (!bank || bank.length === 0) {
    return { ok: false, error: "This course has no assessment questions yet." };
  }

  // Then only the questions this attempt serves. No answer key: starting an
  // attempt needs only what the learner is shown.
  const pickedIds = shuffle(bank.map((q) => q.id as string)).slice(0, QUIZ_TARGET);
  const { data: picked } = await admin
    .from("quiz_questions")
    .select("id, type, question, options, payload")
    .in("id", pickedIds);
  const byId = new Map(
    (picked ?? []).map((q) => [q.id as string, q as StoredQuestion]),
  );
  // Keep the shuffled order — `.in()` returns rows in any order.
  const selected = pickedIds
    .map((id) => byId.get(id))
    .filter((q): q is StoredQuestion => Boolean(q));
  if (selected.length === 0) {
    return { ok: false, error: "This course has no assessment questions yet." };
  }

  const { data: attempt, error } = await admin
    .from("quiz_attempts")
    .insert({
      organisation_id: enrolment.organisation_id,
      user_id: context.userId,
      course_id: courseId,
      question_ids: selected.map((q) => q.id),
    })
    .select("id")
    .single();
  if (error || !attempt) {
    return { ok: false, error: "Could not start the assessment." };
  }

  // Send an answer-stripped projection — correct answers never leave the server.
  return {
    ok: true,
    attemptId: attempt.id,
    questions: selected.map(toPublicQuestion),
  };
}

export interface SubmitQuizResult {
  ok: boolean;
  error?: string;
  score?: number;
  correct?: number;
  total?: number;
  passed?: boolean;
  certificateId?: string;
  /** New stars banked by this attempt (delta over the course's previous best). */
  starsAwarded?: number;
  /** Per-question breakdown. Answers included only on a pass (see ReviewItem). */
  review?: ReviewItem[];
}

/** Grade an attempt server-side, update counters, and issue a certificate on a pass. */
export async function submitQuizAction(
  attemptId: string,
  answers: Record<string, unknown>,
): Promise<SubmitQuizResult> {
  const context = await requireRole("learner");
  const admin = createAdminClient();

  const { data: attempt } = await admin
    .from("quiz_attempts")
    .select("id, user_id, course_id, organisation_id, question_ids, submitted_at")
    .eq("id", attemptId)
    .single();
  if (!attempt || attempt.user_id !== context.userId) {
    return { ok: false, error: "Attempt not found." };
  }
  if (attempt.submitted_at) {
    return { ok: false, error: "This attempt has already been submitted." };
  }

  const questionIds = attempt.question_ids as string[];

  // Everything grading needs, in one parallel round: the served questions
  // (with their answer keys), prior submitted attempts and this course's
  // certificate expiries for the star maths, and the enrolment's counters.
  // Zero-score attempts can never be a best, so they're left out.
  const [{ data: questions }, { data: prior }, { data: certs }, { data: enrolment }] =
    await Promise.all([
      admin
        .from("quiz_questions")
        .select("id, type, question, options, answer_index, payload")
        .in("id", questionIds),
      admin
        .from("quiz_attempts")
        .select("course_id, score, question_ids, submitted_at")
        .eq("user_id", context.userId)
        .eq("course_id", attempt.course_id)
        .not("submitted_at", "is", null)
        .gt("score", 0),
      admin
        .from("certificates")
        .select("expires_at")
        .eq("user_id", context.userId)
        .eq("course_id", attempt.course_id),
      admin
        .from("enrolments")
        .select("id, attempt_count, completion_count")
        .eq("user_id", context.userId)
        .eq("course_id", attempt.course_id)
        .maybeSingle(),
    ]);

  // Grade every question server-side against the stored answer key (per type).
  const byId = new Map<string, StoredQuestion>(
    (questions ?? []).map((q) => [q.id as string, q as StoredQuestion]),
  );
  let correct = 0;
  const graded: { q: StoredQuestion; ok: boolean }[] = [];
  for (const id of questionIds) {
    const q = byId.get(id);
    if (!q) continue;
    const ok = gradeAnswer(q, answers[id]);
    if (ok) correct += 1;
    graded.push({ q, ok });
  }
  const total = questionIds.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const passed = score >= PASS_PERCENT;

  // Per-question review — ONLY on a pass. A failed attempt returns nothing about
  // the questions (not even which ones were wrong); the learner is simply sent
  // back to the course content. This avoids revealing the served question set or
  // the answer key to someone who is about to retake.
  const review: ReviewItem[] | undefined = passed
    ? graded.map(({ q, ok }) => ({
        question: q.question,
        correct: ok,
        your: learnerAnswerText(q, answers[q.id]),
        answer: correctAnswerText(q),
      }))
    : undefined;

  // Star bank: this attempt banks only the improvement over the best already
  // earned in the CURRENT compliance cycle (capped at 20). A cycle starts when
  // the previous certificate expired, so re-passing after expiry banks fresh
  // stars. Prior SUBMITTED attempts + this course's certificate expiries were
  // read above; the current attempt wasn't submitted yet, so it's excluded.
  // Use the exact in-memory `correct` for this attempt (no rounding).
  const boundaries = (certs ?? [])
    .map((c) => (c.expires_at ? Date.parse(c.expires_at) : NaN))
    .filter((n) => !Number.isNaN(n));
  const cycleStart = currentCycleStartMs(boundaries, Date.now());
  const prevStars = bestStarsSince(prior ?? [], cycleStart);
  const nowStars = Math.min(STARS_PER_COURSE, correct);
  const starsAwarded = Math.max(0, nowStars - prevStars);

  // Record the attempt and update the enrolment counters together (every
  // attempt counts; a pass completes + renews).
  await Promise.all([
    admin
      .from("quiz_attempts")
      .update({ answers, score, passed, submitted_at: new Date().toISOString() })
      .eq("id", attemptId),
    enrolment
      ? admin
          .from("enrolments")
          .update({
            attempt_count: (enrolment.attempt_count ?? 0) + 1,
            ...(passed
              ? {
                  completion_count: (enrolment.completion_count ?? 0) + 1,
                  status: "completed",
                  progress: 100,
                }
              : {}),
          })
          .eq("id", enrolment.id)
      : null,
  ]);

  let certificateId: string | undefined;
  if (passed) {
    certificateId = await issueCertificate({
      admin,
      userId: context.userId,
      organisationId: attempt.organisation_id as string,
      courseId: attempt.course_id as string,
    });
  }

  revalidatePath("/learn");
  return { ok: true, score, correct, total, passed, certificateId, starsAwarded, review };
}

/**
 * Award a star for a correctly-answered in-content H5P question. Idempotent:
 * the unique(user_id, question_key) constraint means each question banks at most
 * one star ever, so revisiting a page never farms more. Returns the delta (1 if
 * this is the first correct answer to that question, else 0). Correctness is
 * trusted from the client's H5P grading — cosmetic gamification only.
 */
export async function awardContentStarAction({
  courseId,
  questionKey,
}: {
  courseId: string;
  questionKey: string;
}): Promise<{ delta: 0 | 1 }> {
  const context = await requireRole("learner");
  if (!courseId || !questionKey) return { delta: 0 };

  // Must be enrolled in the course (RLS scopes this select to the learner;
  // the user_id filter lets it use the index).
  const supabase = await createClient();
  const { data: enrolment } = await supabase
    .from("enrolments")
    .select("id")
    .eq("user_id", context.userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!enrolment) return { delta: 0 };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("content_question_stars")
    .upsert(
      {
        user_id: context.userId,
        organisation_id: context.organisationId,
        course_id: courseId,
        question_key: questionKey,
      },
      { onConflict: "user_id,question_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return { delta: 0 };
  // ignoreDuplicates → an existing row yields no returned rows (delta 0).
  return { delta: data && data.length > 0 ? 1 : 0 };
}

/** Signed URL to download a certificate PDF (learner must own it). */
export async function getCertificateUrlAction(
  certificateId: string,
): Promise<{ url?: string; error?: string }> {
  const context = await requireRole("learner");

  // RLS ensures the learner can only read their own certificate.
  const supabase = await createClient();
  const { data: cert } = await supabase
    .from("certificates")
    .select("pdf_path, user_id")
    .eq("id", certificateId)
    .maybeSingle();
  if (!cert || cert.user_id !== context.userId || !cert.pdf_path) {
    return { error: "Certificate not available." };
  }

  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("certificates")
    .createSignedUrl(cert.pdf_path, 60);
  return { url: data?.signedUrl };
}
